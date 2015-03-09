#!/bin/sh
###################################
# BeePing Agent Installer
# Author : ed@suikatech.net
# Homepage : http://www.bee-ping.net
# Licence : GPLv3
###################################

ETCDIR="/etc/beePing"
LOGDIR="/var/log/beePing"
USRDIR="/usr/share/beePing"
INITDDIR="/etc/init.d"

CODELATESTURL="http://code.bee-ping.net/latest"

# Make sure only root can run our script
if [ $(id -u) -ne 0 ]
then
   echo "This script must be run as root" 1>&2
   exit 1
else
	# Is token supplied
	if [ -z "$1" ]
	then
		echo "The account Uid must be supplied, get it from BeePing interface >My Nodes >install"
		exit 1
	fi
	
	# Is token supplied
	if [ -z "$2" ]
	then
		echo "The node token must be supplied, get it from BeePing interface >My Nodes >install"
		exit 1
	fi
	
	# Variable to know if wget or curl must be used
	isWget=0
	
	# Is wget installed ?
	which wget > /dev/null 2> /dev/null

	if [ $? -eq 0 ]
	then
		isWget=1
	else
		# Is curl installed ?
		which curl > /dev/null 2> /dev/null

		if [ $? -ne 0 ]
		then
			echo "Wget nor curl is installed on your system"
			echo "Please install one of them and run install script again"
			exit 1
		fi
	fi
	
	
	# Is node installed ?
	node -v > /dev/null 2> /dev/null

	if [ $? -ne 0 ]
	then
		echo "NodeJs is not installed on your system"
		echo "Please install it and run install script again"
		echo "Instructions are available on this page:"
		echo "https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager"
		if [ $isWget -eq 1 ]
		then
			echo "----------------------"
			echo "For debian based distros you can try:"
			echo "wget -qO- https://deb.nodesource.com/setup | bash -"
			echo "----------------------"
			echo "For Red Hat based distros you can try:"
			echo "wget -qO- https://rpm.nodesource.com/setup | bash -"
		else
			echo "----------------------"
			echo "For debian based distros you can try:"
			echo "curl -sL https://deb.nodesource.com/setup | bash -"
			echo "----------------------"
			echo "For Red Hat based distros you can try:"
			echo "curl -sL https://rpm.nodesource.com/setup | bash -"			
		fi
		exit 1
	fi
	
	# Is npm installed ?
	npm -v > /dev/null 2> /dev/null

	if [ $? -ne 0 ]
	then
		echo "NPM is not installed on your system"
		echo "Please install it and run install script again"
		exit 1
	fi

	# Is g++ installed ?
	g++ -v > /dev/null 2> /dev/null

	if [ $? -ne 0 ]
	then
		echo "g++ is not installed on your system"
		echo "It is required to build module dependancies"
		echo "Please install it and run install script again"
		echo "----------------------"
		echo "For debian based distros you can try:"
		echo "apt-get install build-essential"
		echo "----------------------"
		echo "For Red Hat based distros you can try:"
		echo "yum install gcc-c++ make"
		exit 1
	fi

	# Is make installed ?
	make -v > /dev/null 2> /dev/null

	if [ $? -ne 0 ]
	then
		echo "make is not installed on your system"
		echo "It is required to build module dependancies"
		echo "Please install it and run install script again"
		exit 1
	fi

	# Check if user exists
	nodejsUser=`id beePing > /dev/null 2> /dev/null`

	if [ $? -ne 0 ]
	then
		echo "beeping user not found, creating it"
		# No user, create it
		useradd --system beePing
		if [ $? -ne 0 ]
		then
			echo "User beeping cannot be created, aborting install"
			exit 1
		fi
	fi
	
	# Get user uuid
	nodejsUserUuid=`id beePing | cut -d"=" -f2 | cut -d"(" -f1`

	if [ $? -eq 0 ]
	then
		echo "Found user beePing with Uuid: $nodejsUserUuid"
	fi

	# Create config directory if necessary
	mkdir -p $ETCDIR
	# Download Config File template
	if [ $isWget -eq 1 ]
	then
		wget --no-check-certificate -O $ETCDIR/bpconfig.js $CODELATESTURL/bpconfig.js.template
	else
		curl $CODELATESTURL/bpconfig.js.template -o $ETCDIR/bpconfig.js
	fi

	# Fill Template
	sed -i "s/{USERUID}/$nodejsUserUuid/" $ETCDIR/bpconfig.js
	sed -i "s/{ACCOUNTUID}/$1/" $ETCDIR/bpconfig.js
	sed -i "s/{TOKEN}/$2/" $ETCDIR/bpconfig.js

	# Make it readable by root only
	chmod 400 $ETCDIR/bpconfig.js
	
	# Create script directory if necessary
	mkdir -p $USRDIR
	# Download Agent
	if [ $isWget -eq 1 ]
	then
		wget --no-check-certificate -O $USRDIR/agent.js $CODELATESTURL/agent.js
		wget --no-check-certificate -O $USRDIR/package.json $CODELATESTURL/package.json
	else
		curl $CODELATESTURL/agent.js -o $USRDIR/agent.js
		curl $CODELATESTURL/package.json -o $USRDIR/package.json	
	fi
	

	# Retain current directory and move to agent directory
	CURRENTDIR=`pwd`	
	cd $USRDIR
	
	# Install dependancies
	npm install
	
	# Forever path
	NODEBINDIR=`npm bin`
	echo $NODEBINDIR

	# Back to directory
	cd $CURRENTDIR

	# Create log dir if necessary
	mkdir -p $LOGDIR
	
	# Add stop/start scripts
	if [ $isWget -eq 1 ]
	then
		wget --no-check-certificate -O $INITDDIR/beePing $CODELATESTURL/beePing.init.d
	else
		curl $CODELATESTURL/beePing.init.d -o $INITDDIR/beePing
	fi
	# Change mod
	chmod 755 $INITDDIR/beePing
	
	# Schedule to start
	# Flag to avoid nesting
	isScheduled=0

	# update-rc.d
	which update-rc.d > /dev/null 2> /dev/null
	if [ $? -eq 0 ]
	then
		# Set Flag
		isScheduled=1
		/usr/sbin/update-rc.d beePing defaults
	fi

	# chkconfig
	if [ $isScheduled -eq 0 ]
	then
		which chkconfig > /dev/null 2> /dev/null
		if [ $? -eq 0 ]
		then
			# Set Flag
			isScheduled=1
			chkconfig --add beePing
		fi
	fi

	# rc-update
	if [ $isScheduled -eq 0 ]
	then
		which rc-update > /dev/null 2> /dev/null
		if [ $? -eq 0 ]
		then
			# Set Flag
			isScheduled=1
			rc-update add beePing default
		else
			echo "Unable to set agent to start on boot, please add it manually (/etc/init.d/beePing)"
		fi
	fi
	
	# Message
	echo "beePing agent has successfully been installed"
	echo "You can start it by running /etc/init.d/beePing start"
fi
