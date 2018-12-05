FROM node:alpine
MAINTAINER Jiewei Qian <qjw@wacky.one>

ADD . .
RUN apk add --no-cache curl
RUN yarn install
RUN mkdir -p ~/hikaru/

ENV HIKARU_DEFAULT_AMQP="amqp://rabbitmq/"

ENTRYPOINT ["bin/hikaru"]