require('source-vimrc')
require('disable-netrw')
require('configure-diagnostics')
require('highlight-selection-on-yank')
require('install-plugins')(require('install-packer'))
require('configure-plugins')
require('setup-keymaps')

