FROM node:alpine
LABEL maintainer="Jiewei Qian <qjw@wacky.one>"

ENV HIKARU_DEFAULT_AMQP="amqp://rabbitmq/"
ENV HIKARU_DEFAULT_MONGO="mongodb://mongo/hikaru"

RUN mkdir -p ~/hikaru/
ADD . .
RUN apk add --no-cache curl && yarn install

ENTRYPOINT ["bin/hikaru"]