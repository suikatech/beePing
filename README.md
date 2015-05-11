# beePing Agent
## Table of Contents
- [Introduction](#introduction)
- [How to install](#how-to-install)
- [How to run](#how-to-run)
- [How to uninstall](#how-to-uninstall)
- [License](#license)
- [Improvements](#improvements)


## Introduction
This code is an agent written in nodeJs meant to run on the beePing network. It get and processes the requests assigned to the node and sends the results to the platform.

## How to install
We recommend using the command provided in the beePing dashboard as it includes the configuration token necessary to download the configuration for your node.

## How to run
Once installed, the agent is set up to start automatically on system boot. However you can control the agent using the init.d script:

Start agent
```
/etc/init.d/beeping start
```

Stop agent
```
/etc/init.d/beeping stop
```

Status
```
/etc/init.d/beeping status
```

## How to uninstall
Uninstall script coming soon...

## License
The beePing agent is currently released under the GPLv3 license

## Improvements
You can make open an issue for feature requests or bug reports : [Issue tab](https://github.com/suikatech/beePing/issues) 
