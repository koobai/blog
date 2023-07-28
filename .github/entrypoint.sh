#!/bin/sh -l

echo "bucket: $bucket operator: $operator password: $password dir: $dir"

cd /opt/www/

echo 'Building the UpYun-Deployer...'

go build .

echo 'Deploying to UpYun...'

output=`./upyun-deployer -bucket "$bucket" -operator "$operator" -password "$password" -dir "$dir"`

echo 'Complete'

echo "output=$output=" >> $GITHUB_OUTPUT
