#!/bin/sh
###################################
# BeePing Agent Uninstaller
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
	printf '%b' "\033[1;31mThis script must be run as root \033[0m\n" 1>&2
	exit 1
else

	# Check if beePing Agent is running
	printf '%b' "Checking if beePing agent is running\n"
	if [ -e "$INITDDIR/beePing" ]
	then
		# Get status
		$INITDDIR/beePing status
		
		if [ $? -eq 0 ]
		then
			# Is running
			$INITDDIR/beePing stop
		fi
		
		# Remove init file
		printf '%b' "Removing beePing agent init file... "
		rm $INITDDIR/beePing

		if [ $? -eq 0 ]
		then
			printf '%b' "\033[1;32mOK \033[0m\n"
		else
			printf '%b' "\033[1;31mKO \033[0m\n"
		fi

	fi
	
	# Removing agent files
	if [ -e "$USRDIR" ]
	then
		# Remove
		printf '%b' "Removing beePing agent files... "
		rm -R $USRDIR

		if [ $? -eq 0 ]
		then
			printf '%b' "\033[1;32mOK \033[0m\n"
		else
			printf '%b' "\033[1;31mKO \033[0m\n"
		fi
	fi
	
	# Removing config files
	if [ -e "$ETCDIR" ]
	then
		# Remove
		printf '%b' "Removing beePing config files... "
		rm -R $ETCDIR

		if [ $? -eq 0 ]
		then
			printf '%b' "\033[1;32mOK \033[0m\n"
		else
			printf '%b' "\033[1;31mKO \033[0m\n"
		fi
	fi
	
	## Removing log files
	#if [ -e "$LOGDIR" ]
	#then
		## Remove
		#rm -R $LOGDIR
	#fi
	
	# Removing from start scripts
	# Flag to avoid nesting
	isUnscheduled=0

	printf '%b' "Removing beePing agent from start scripts... \n"
	# update-rc.d
	which update-rc.d > /dev/null 2> /dev/null
	if [ $? -eq 0 ]
	then
		# Set Flag
		isUnscheduled=1
		/usr/sbin/update-rc.d beePing remove

		if [ $? -eq 0 ]
		then
			printf '%b' "\033[1;32mOK \033[0m\n"
		else
			printf '%b' "\033[1;31mKO \033[0m\n"
		fi
	fi

	# chkconfig
	if [ $isUnscheduled -eq 0 ]
	then
		which chkconfig > /dev/null 2> /dev/null
		if [ $? -eq 0 ]
		then
			# Set Flag
			isUnscheduled=1
			chkconfig --del beePing

			if [ $? -eq 0 ]
			then
				printf '%b' "\033[1;32mOK \033[0m\n"
			else
				printf '%b' "\033[1;31mKO \033[0m\n"
			fi
		fi
	fi

	# rc-update
	if [ $isUnscheduled -eq 0 ]
	then
		which rc-update > /dev/null 2> /dev/null
		if [ $? -eq 0 ]
		then
			# Set Flag
			isUnscheduled=1
			rc-update delete beePing

			if [ $? -eq 0 ]
			then
				printf '%b' "\033[1;32mOK \033[0m\n"
			else
				printf '%b' "\033[1;31mKO \033[0m\n"
			fi
		else
			printf '%b' "\033[1;31mUnable to remove agent autostart, please remove it manually (/etc/init.d/beePing) \033[0m\n"
		fi
	fi
	
	# Message
	printf '%b' "beePing agent has successfully been uninstalled\n"
fi
