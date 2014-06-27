#!/bin/bash
function die {
    echo $1;
    exit 100;
}
NODE=`which node` || `which nodejs` || die 'please install nodejs'
$NODE make.js $@
