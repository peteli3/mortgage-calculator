FROM python:3.13 AS tailwind

WORKDIR /home
COPY ./app /home/app
COPY ./tailwind.config.js /home

# Install tailwindcss
ARG TAILWIND_VERSION=v4.1.5
ARG TAILWIND_BUILD=linux-x64
RUN curl --output tailwindcss -sLO https://github.com/tailwindlabs/tailwindcss/releases/download/${TAILWIND_VERSION}/tailwindcss-${TAILWIND_BUILD}
RUN chmod +x tailwindcss

# Install daisyUI
ARG DAISYUI_VERSION=v5.0.35
RUN curl -sLO https://github.com/saadeghi/daisyui/releases/download/${DAISYUI_VERSION}/daisyui.js
RUN curl -sLO https://github.com/saadeghi/daisyui/releases/download/${DAISYUI_VERSION}/daisyui-theme.js

# Build css
RUN ./tailwindcss -i app/static/input.css -o app/static/output.css --minify

FROM python:3.13-alpine AS runtime

WORKDIR /home
COPY ./app /home/app
COPY --from=tailwind /home/app/static/output.css /home/app/static/output.css

# Install python dependencies
COPY ./requirements.txt /home
RUN pip install --no-cache-dir --upgrade -r /home/requirements.txt

# Set app version and git commit
ARG GIT_COMMIT
ENV GIT_COMMIT=${GIT_COMMIT:-unknown}
ENV VERSION=1.0

CMD ["fastapi", "run", "app/main.py", \
    "--proxy-headers", \
    "--port", "80"]
