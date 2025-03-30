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
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install CDK for Terraform globally
RUN npm install --global cdktf-cli@latest

# Install terraform
ARG TERRAFORM_VERSION
RUN wget https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip && \
    unzip ./terraform_${TERRAFORM_VERSION}_linux_amd64.zip -d /usr/local/bin/ && \
    rm ./terraform_${TERRAFORM_VERSION}_linux_amd64.zip && \
    chmod +x /usr/local/bin/terraform

# Verify Terraform installation
RUN terraform --version

# Set command
CMD ["/bin/bash"]