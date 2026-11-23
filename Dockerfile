# Use an official Node.js runtime as a parent image
ARG NODE_VERSION
FROM node:${NODE_VERSION}

# Set the working directory in the container to /app
WORKDIR /app

# Install tools
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    wget \
    gnupg \
    jq \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install the CDKTN CLI globally, at the same version as app/package.json
# (cdktn-cli). Change both together.
RUN npm install --global cdktn-cli@0.25.1

# Install tenv
ARG TERRAFORM_VERSION
ARG OPENTOFU_VERSION

RUN LATEST_VERSION=$(curl --silent https://api.github.com/repos/tofuutils/tenv/releases/latest | jq -r .tag_name) && \
    curl -O -L "https://github.com/tofuutils/tenv/releases/latest/download/tenv_${LATEST_VERSION}_amd64.deb" && \
    dpkg -i "tenv_${LATEST_VERSION}_amd64.deb" || apt -f install -y

RUN tenv tf install ${TERRAFORM_VERSION} && \
    tenv tofu install ${OPENTOFU_VERSION}

RUN ln -s /usr/local/bin/tenv /usr/local/bin/terraform && \
    ln -s /usr/local/bin/tenv /usr/local/bin/tofu

# Verify Terraform installation
RUN cdktn --version && terraform --version && tofu --version

# Set command
CMD ["/bin/bash"]