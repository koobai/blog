FROM golang:1.17-alpine3.16
LABEL maintainer="her-cat <hxhsoft@foxmail.com>"

WORKDIR /opt/www/
COPY . .

RUN chmod +x /opt/www/entrypoint.sh

ENTRYPOINT ["/opt/www/entrypoint.sh"]
