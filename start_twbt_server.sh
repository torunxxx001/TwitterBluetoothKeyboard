#!/bin/bash

SCRIPT_DIR=$(cd $(dirname $0);pwd)

pushd ${SCRIPT_DIR}/tw_server
/usr/bin/node http_server.js &
popd

while :
do

  ${SCRIPT_DIR}/bt_server/serv

  if [ $?  =  0 ]; then
    break
  fi

  sleep 1
done
