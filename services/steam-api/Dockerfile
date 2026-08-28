FROM node:24-alpine

WORKDIR /app

COPY --chown=node:node package.json server.mjs ./

RUN mkdir -p /data && chown node:node /data

ENV CACHE_FILE=/data/dashboard.json \
	HOST=0.0.0.0 \
	PORT=8788

VOLUME ["/data"]
EXPOSE 8788

USER node

CMD ["node", "server.mjs"]
