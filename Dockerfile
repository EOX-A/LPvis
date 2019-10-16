# production stage
FROM nginx:1.13.12-alpine as production-stage
COPY . /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/
EXPOSE 80

# Copy .env file and shell script to container
WORKDIR /usr/share/nginx/html
COPY ./env.sh .
COPY .env .

# Add bash
RUN apk add --no-cache bash

# Make our shell script executable
RUN chmod +x env.sh

CMD ["/bin/bash", "-c", "/usr/share/nginx/html/env.sh && nginx -g \"daemon off;\""]