#!/usr/bin/env bash

# Deno
rtx plugin add deno https://github.com/asdf-community/asdf-deno.git
rtx global deno

# Go
rtx plugin add golang https://github.com/kennyp/asdf-golang.git
rtx global golang

# Lua
rtx plugin add lua https://github.com/Stratus3D/asdf-lua.git
rtx global lua

# Node
rtx global nodejs

# pnpm
rtx plugin add pnpm https://github.com/jonathanmorley/asdf-pnpm.git
rtx global pnpm

# Python
rtx global python

# Ruby
rtx global ruby

# Rust
rtx plugin add rust https://github.com/asdf-community/asdf-rust.git
rtx global rust

# Terraform
rtx plugin add terraform https://github.com/asdf-community/asdf-hashicorp.git
rtx global terraform

# Yarn
rtx global yarn
