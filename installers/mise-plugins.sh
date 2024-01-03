#!/usr/bin/env bash

# Deno
mise plugin add deno https://github.com/asdf-community/asdf-deno.git
mise global deno

# Go
mise plugin add golang https://github.com/kennyp/asdf-golang.git
mise global golang

# Lua
mise plugin add lua https://github.com/Stratus3D/asdf-lua.git
mise global lua

# Node
mise global nodejs

# pnpm
mise plugin add pnpm https://github.com/jonathanmorley/asdf-pnpm.git
mise global pnpm

# Python
mise global python

# Ruby
mise global ruby

# Rust
mise plugin add rust https://github.com/asdf-community/asdf-rust.git
mise global rust

# Terraform
mise plugin add terraform https://github.com/asdf-community/asdf-hashicorp.git
mise global terraform

# Yarn
mise global yarn
