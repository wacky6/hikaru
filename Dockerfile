FROM node:alpine
MAINTAINER Jiewei Qian <qjw@wacky.one>

ADD . .
RUN apk add --no-cache curl
RUN yarn install
RUN mkdir -p /hikaru/

# TODO: make Dockerfile include crontab support
ENTRYPOINT ["bin/hikaru"]