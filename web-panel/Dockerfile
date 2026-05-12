FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY . /usr/share/nginx/html/
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/README.md /usr/share/nginx/html/package.json

ENV PANEL_LISTEN_PORT=80
ENV CLI_PROXY_UPSTREAM=http://cli-proxy-api:8317

EXPOSE 80
