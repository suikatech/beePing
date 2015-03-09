/* 
 * 
 * beePing Agent
 * Author : ed@suikatech.net
 * Homepage : http://www.bee-ping.net
 * Licence : GPLv3
 * 
 * */

var netInstance = require('net');
var http = require('http');
var express = require('express');
var netping = require ("net-ping");
var request = require('request');
var dns = require('dns');

/* Get Config */
var bpconfig = require('/etc/beePing/bpconfig');

/* Create Instances */
// Create an express instance for the small web interface
var serverInterface = express();
// Create a ping session instance
var session = netping.createSession ();

/* Variables */
// Time Sync				
var timeCompensation = 0;
var syncPassCount = 0;
var timeDiffArray = [];				
// Queue for scheduled requests
var queueScheduledRequest = new Array();
// Queue for ping requests
var queuePingRequest = new Array();
// Queue for http requests
var queueHttpRequest = new Array();
// Queue for tcp requests
var queueTcpRequest = new Array();
// Array for tcp connections
var tcpConnectionArray = new Array();
// Lock to prevent hammering the master too fast and queue collision
var fetchLock = false;
var processLock = false;
// Timeout value and object
var timeoutHandler = null;
var timeoutTimestamp = -1;
// Log for last calls (for rate limiting)
var lastCallLogArray = new Array();
// Build JSON object to get requests
var JSONQueryGet = {
				"accountUid":bpconfig.accountUid,
				"agentToken":bpconfig.agentToken
				};


/* Create a small interface  */
/*
 * Stat page
 * Reload queues
 * 
 */
console.log('Starting Server on '+bpconfig.agentPort);
serverInterface
	.get('/stats', function(request, response){
			
			// Write queue sizes
			var responseBody = "{";
			responseBody = responseBody + '"scheduleQueue":' + queueScheduledRequest.length + ',';
			responseBody = responseBody + '"pingQueue":' + queuePingRequest.length + ',';
			responseBody = responseBody + '"httpQueue":' + queueHttpRequest.length + ',';
			responseBody = responseBody + '"tcpQueue":' + queueTcpRequest.length;		
			responseBody = responseBody + '}';
			
			response.writeHead(200, {"Content-Type": "text/plain"});
			response.write(responseBody);
			
			response.end();
			// Fetching items and pinging
			console.log('stats');
			//fetchQueueItems();
	})
	.get('/reload', function(request, response){
			response.end();
			// Fetching items and pinging
			console.log('reload');
			fetchRequests();
	})
	.listen(bpconfig.agentPort);

/* The agent functions */
/**
 * Set a periodic check for degraded mode.
 * TODO
 * 
 */
//setInterval(function () {fetchRequests()}, 500);

/**
 * 
 * 
 * 
 * 
 */
function syncClocks()
{
	// Get current time
	var currentTime = (new Date().getTime());
	
	// Send query to sync server
	request.post(bpconfig.masterUrl+'/syncClock.php', {}, function (requestTime, error, response, body) {
		// Get current time	
		var newCurrentTime = new Date().getTime();

		// Calculate delay
		var roundTripDelay = newCurrentTime - requestTime;
		console.log('roundTripDelay: '+roundTripDelay);

		// Parse the request
		try
		{
			var jsonBody = JSON.parse(body);
		}
		catch (exception)
		{
			console.log('Failed to synchronize time with server');
		}
		
		// We remove the delay for the request (estimated at roundtripDelay/2)
		newCurrentTime = newCurrentTime - roundTripDelay/2;

		// Calculating the time difference
		var timeDiff = (jsonBody.timestamp - newCurrentTime)
		console.log('Time difference with server pass #' + syncPassCount + ': '+ timeDiff +' ms');
		
		if (syncPassCount < 6)
		{
			// Add to array
			timeDiffArray.push(timeDiff);
			syncPassCount++;
			syncClocks();
		}
		else
		{
			// Add to array
			timeDiffArray.push(timeDiff);

			var meanTimeDiff = 0;
			// Calculating the mean
			for (var i=0; i < timeDiffArray.length; i++)
			{
				meanTimeDiff += timeDiffArray[i];
			}
			
			meanTimeDiff = meanTimeDiff/timeDiffArray.length;

			// Time compensation
			timeCompensation = Math.round(meanTimeDiff);
			
			console.log('Time Compensation: '+timeCompensation);

			// Rearm variables for future use
			syncPassCount = 0;
			timeDiffArray = [];

			// Check if time is synchronized
			synchronize();
		}

	}.bind(null, currentTime));	
}

function synchronize()
{
	// Check delay
	// Get current time
	var currentTime = (new Date().getTime()) + timeCompensation;
	
	// Send query to sync server
	request.post(bpconfig.masterUrl+'/syncClock.php', {}, function (requestTime, error, response, body) {
		// Get current time	
		var newCurrentTime = new Date().getTime() + timeCompensation;

		// Calculate delay
		var roundTripDelay = newCurrentTime - requestTime;
		console.log('roundTripDelay: '+roundTripDelay);

		// Parse the request
		try
		{
			var jsonBody = JSON.parse(body);
		}
		catch (exception)
		{
			console.log('Failed to synchronize time with server');
		}
		
		// We remove the delay for the request (estimated at roundtripDelay/2)
		newCurrentTime = newCurrentTime - roundTripDelay/2;

		// Calculating the time difference
		var timeDiff = (jsonBody.timestamp - newCurrentTime)
		console.log('Time difference with server: '+ timeDiff +' ms');
	
		if (Math.abs(timeDiff) > bpconfig.timeTolerance)
		{
			// More than time tolerance, try to synchronize
			syncClocks();
		}
		else
		{
			console.log('Time is synchronized');
		}

	}.bind(null, currentTime));		
}

// Start time sync
synchronize();


function sendHeartbeat()
{
	// Send heartbeat to server and schedule next one in 10s
	request.post(bpconfig.masterUrl+'/setHeartbeat.php', { form: { "JSONQuery":JSON.stringify(JSONQueryGet) }  }, function (error, response, body) {
		setTimeout(function () {sendHeartbeat()}, 10000);
	});	
}
// First call
sendHeartbeat();

// Set our server's uid to beePing uid
if (bpconfig.userUid)
{
	process.setuid(bpconfig.userUid);
	console.log('Dropping privileges by changing Server\'s user, new UID is ' + process.getuid());
}

/**
 * This function fetches the requests from the master server.
 * It populates the queues while checking for duplicates.
 * It then calls the processing functions
 * @return void
 */
function fetchRequests()
{
	// Check if lock is active
	if (processLock == true || fetchLock == true)
	{
		return;
	}
	
	// Set lock
	fetchLock = true;
	
	// Send results to server
	request.post(bpconfig.masterUrl+'getRequest.php', { form: { "JSONQuery":JSON.stringify(JSONQueryGet) }  }, function (error, response, body) {
		if (!error)
		{
			if (response.statusCode == 200 && body != "")
			{
				// Log
				//console.log(body);
				// Parse the request
				try
				{
					var jsonBody = JSON.parse(body);
				}
				catch (exception)
				{
					// Simply drop
					// Release lock
					fetchLock = false;
					return;
				}
				
				//console.log(jsonList);
				for (var i=0; i<jsonBody.requests.length; i++)
				{
					// If we have reached the rate, not processing anymore
					if (getLastCallLogArrayCount() <= bpconfig.maxRate)
					{
						// Add to scheduled queue
						// Check for duplicates before adding
						var queueScheduledRequestPos = indexOfArrayItem(queueScheduledRequest, jsonBody.requests[i].uid);
						// Not present
						if (queueScheduledRequestPos == -1)
						{
							// Add timestamp
							jsonBody.requests[i].timestamp = new Date(jsonBody.requests[i].createDate.replace(" ", "T")).getTime();
							// Add to queue
							queueScheduledRequest.push(jsonBody.requests[i]);
						}
						
						// Set new timeout if necessary
						setNextProcessingTime(jsonBody.requests[i].timestamp);
					}			
				}
			}
			else
			{
				console.log('Cannot fetch requests, server code:'+response.statusCode);
			}
		}
		else
		{
			// Log Error
			console.log('Cannot fetch requests');
		}
		
		// Release lock
		fetchLock = false;
	});
	
}

function processScheduledQueue()
{
	// Lock fetch to prevent queue collisison
	processLock = true;
	
	// Get current Timestamp + 500 ms (so that we don't reprocess the process queue while running, requests are precise down to seconds)
	var currentTimestamp = new Date().getTime() + 500;
	
	// tmpQueueScheduledRequest
	var tmpQueueScheduledRequest = [];
	// closest timestamp
	var closestTimestamp = -1;
	
	while (queueScheduledRequest.length > 0)
	{
		// Pop element from array
		var scheduledRequest = queueScheduledRequest.pop();

		// If time to process
		if (scheduledRequest.timestamp <= currentTimestamp)
		{
			if (scheduledRequest.type == "PING")
			{
				// Ping
				// Check for duplicates before adding
				var queuePingRequestPos = indexOfArrayItem(queuePingRequest, scheduledRequest.uid);
				// Not present
				if (queuePingRequestPos == -1)
				{
					// Add to queue
					queuePingRequest.push(scheduledRequest);
				}
			}
			else if (scheduledRequest.type == "HTTP")
			{
				// Http
				// Check for duplicates before adding
				var queueHttpRequestPos = indexOfArrayItem(queueHttpRequest, scheduledRequest.uid);
				// Not present
				if (queueHttpRequestPos == -1)
				{
					// Add to queue
					queueHttpRequest.push(scheduledRequest);
				}
			}
			else if (scheduledRequest.type == "TCP")
			{
				// Tcp
				// Check for duplicates before adding
				var queueTcpRequestPos = indexOfArrayItem(queueTcpRequest, scheduledRequest.uid);
				// Not present
				if (queueTcpRequestPos == -1)
				{
					// Add to queue
					queueTcpRequest.push(scheduledRequest);
				}
			}
			else
			{
				// Unknown type
			}
		}
		else
		{
			// Rebuild the queueScheduledRequest
			tmpQueueScheduledRequest.push(scheduledRequest);
			// Calculate closest timestamp
			if (closestTimestamp == -1 || scheduledRequest.timestamp < closestTimestamp)
			{
				closestTimestamp = scheduledRequest.timestamp;
			}
		}
	}
	
	// Reaffect queue
	queueScheduledRequest = tmpQueueScheduledRequest;

	// Reset timeout
	timeoutHandler = null;
	timeoutTimestamp = -1;		
	
	// Release lock
	processLock = false;

	// Arm timeout
	if (closestTimestamp != -1)
	{
		setNextProcessingTime(closestTimestamp);
	}

	// Call the processors
	processQueuePing();
	processQueueHttp();
	processQueueTcp();	
}

function processQueuePing()
{
	while (queuePingRequest.length > 0)
	{
		// Pop element from array
		var pingRequest = queuePingRequest.pop();

		console.log('IP:'+pingRequest.target);
		// Send ping
		session.pingHost (pingRequest.target, function (uid, error, target, sent, rcvd) {

			//console.log(queuedItemPos);

			//console.log('queue');
			//console.log(queueItems);
			//console.log ("uid" + uid);
			// Calculate delay
			var delay = rcvd-sent;

			// Error has happened
			if (error)
			{
				if (error.toString().indexOf("Error: Unknown response type '8'") != -1)
				{
					// Trying to ping self
					console.log ('type 8: localhost');
					console.log (target + ": Alive");
					//sendResult(uid, target, true, 0, delay);
					lookupSendResult(uid, target, target, true, 0, delay);
				}
				else if (error instanceof netping.RequestTimedOutError)
				{
					// Timeout
					console.log (target + ": Not alive");
					//sendResult(uid, target, false, 0, delay);
					lookupSendResult(uid, target, target, false, 0, delay);
				}
				else
				{
					// Other error
					console.log (target + ": " + error.toString ());
					//sendResult(uid, target, false, 0, delay);
					lookupSendResult(uid, target, target, false, 0, delay);
				}
			}
			else
			{
				// Target has responded
				console.log (target + ": Alive");
				//sendResult(uid, target, true, 0, delay);
				lookupSendResult(uid, target, target, true, 0, delay);
			}
		}.bind(null,pingRequest.uid));
	}	
}

function processQueueHttp()
{
	while (queueHttpRequest.length > 0)
	{
		// Pop element from array
		var httpRequest = queueHttpRequest.pop();

		console.log('Address:'+httpRequest.target);
		// Send ping
		request.head(httpRequest.target, function (uid, target, timeStart, error, response, body) {
			
			// Calculate Delay
			var delay = (new Date().getTime()) - timeStart;

			if (error)
			{
				// Send error
				console.log(target + "Error");
			}
			else
			{
				// Check Code
				if (response.statusCode == 200)
				{
					// Target has responded
					console.log (target + ": Alive");
					//sendResult(uid, target, true, response.statusCode, delay);
					lookupSendResult(uid, response.request.host, target, true, response.statusCode, delay);
				}
				else
				{
					// Target has responded
					console.log (target + ": Alive but error");
					//sendResult(uid, target, false, response.statusCode, delay);
					lookupSendResult(uid, response.request.host, target, false, response.statusCode, delay);
				}
			}
        }.bind(null, httpRequest.uid, httpRequest.target, new Date().getTime()));
	}	
}

function processQueueTcp()
{
	while (queueTcpRequest.length > 0)
	{
		// Pop element from array
		var tcpRequest = queueTcpRequest.pop();

		console.log('Target:'+tcpRequest.target);
		// Extract IP and port (0=IP, 1=port)
		var target = tcpRequest.target.split(":");
		// Open Tcp Socket
		var socket = netInstance.createConnection(target[1], target[0]);
		
		socket.on('connect', function(uid, target, timeStart, socket, targetHost){
				// Ok, socket is responding
				// Calculate Delay
				var delay = (new Date().getTime()) - timeStart;
				
				// Closing
				socket.destroy();
				// Send result
				//sendResult(uid, target, true, 0, delay);
				lookupSendResult(uid, targetHost, target, true, 0, delay);
			}.bind(null, tcpRequest.uid, tcpRequest.target, new Date().getTime(), socket, target[0]));
		
		socket.on('error', function(uid, target, timeStart, targetHost, error){
				// Calculate Delay
				var delay = (new Date().getTime()) - timeStart;

				// Send result
				//sendResult(uid, target, false, 0, delay);
				lookupSendResult(uid, targetHost, target, false, 0, delay);
			}.bind(null, tcpRequest.uid, tcpRequest.target, new Date().getTime(), target[0]));
	}	
}

function lookupSendResult(uid, targetHost, target, success, code, delay)
{
	dns.lookup(targetHost, function (error, address, family) {
		sendResult(uid, address, target, success, code, delay);
	});
}

function sendResult(uid, targetIp, target, success, code, delay)
{
	// Adding one entry to the lastCallLogArray
	lastCallLogArray.push(new Date().getTime());
	
	console.log('-----------');
	console.log('uid:'+uid);
	console.log('target:'+target);
	console.log('targetIp:'+targetIp);
	console.log('success:'+success);
	console.log('code:'+code);
	console.log('delay:'+delay);
	// Build JSON object
	var JSONQuery = {
					"accountUid":bpconfig.accountUid,
					"agentToken":bpconfig.agentToken,
					"uid":uid,
					"success":success,
					"delay":delay,
					"targetIp":targetIp,
					"resultCode":code
					};
					
	// Send results to server
	request.post(bpconfig.masterUrl+'setRequest.php', { form: {  "JSONQuery":JSON.stringify(JSONQuery) }  }, function (error, response, body) {
	//request.post('http://tvter.net/dev/querylogger.php', { form: {  "JSONQuery":JSON.stringify(JSONQuery) }  }, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			console.log(body);
		}
	});
}

function getLastCallLogArrayCount()
{
	var oldTimestamp = new Date().getTime() - 60;
	
	var newLastCallLogArray = new Array();
	
	// Rebuild array
	for (var i=0; i<lastCallLogArray.length; i++)
	{
		if (lastCallLogArray[i] > oldTimestamp)
		{
			newLastCallLogArray.push(lastCallLogArray[i]);
		}
	}
	
	// Reassign array
	lastCallLogArray = newLastCallLogArray;

	return lastCallLogArray.length;
}


function indexOfArrayItem(queueItems, uid)
{
	for (var i=0; i<queueItems.length; i++)
	{
		if (queueItems[i].uid == uid)
		{
			return i;
		}
	}
	return -1;
}

function setNextProcessingTime(timestamp)
{
	// Compare to scheduled call
	if (timeoutTimestamp == -1 || (timeoutTimestamp-timestamp) > 0)
	{
		// Clear previous if any
		if (timeoutHandler != null)
		{
			clearTimeout(timeoutHandler);
		}
		
		// Set new timeout
		timeoutTimestamp = timestamp;
		
		var timeoutDelay = timeoutTimestamp - (new Date().getTime() + timeCompensation);
		if (timeoutDelay < 0)
		{
			timeoutDelay = 1;
		}
		
		timeoutHandler = setTimeout(function () {processScheduledQueue()}, timeoutDelay);
		
		console.log("Set timeout to :" + timeoutDelay);
	}
}
