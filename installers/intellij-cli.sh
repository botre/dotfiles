#!/usr/bin/env bash

src='#!/bin/sh
open -na "IntelliJ IDEA.app" --args "$@"'

echo "$src" | sudo tee /usr/local/bin/idea

sudo chmod +x /usr/local/bin/idea
