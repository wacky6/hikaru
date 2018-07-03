FROM node:alpine
MAINTAINER Jiewei Qian <qjw@wacky.one>

ADD . .
RUN yarn install

# TODO: make Dockerfile include crontab support
ENTRYPOINT ["bin/hikaru"]