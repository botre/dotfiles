-- Source .vimrc
vim.api.nvim_exec(
        [[
        set runtimepath^=~/.vim runtimepath+=~/.vim/after
        let &packpath=&runtimepath
        source ~/.vimrc
        ]], false)

-- Install packer
local install_packer_if_not_exists = function()
    local fn = vim.fn
    local install_path = fn.stdpath('data') .. '/site/pack/packer/start/packer.nvim'
    if fn.empty(fn.glob(install_path)) > 0 then
        fn.system({ 'git', 'clone', '--depth', '1', 'https://github.com/wbthomason/packer.nvim', install_path })
        vim.cmd [[packadd packer.nvim]]
        return true
    end
    return false
end

local installed_packer = install_packer_if_not_exists()

-- Install plugins
vim.cmd [[packadd packer.nvim]]

require('packer').startup(function(use)
    use { 'wbthomason/packer.nvim' }

    use { 'adelarsq/vim-matchit' }
    use { 'catppuccin/nvim', as = 'catppuccin' }
    use { 'kana/vim-textobj-entire' }
    use { 'kana/vim-textobj-user' }
    use {
        'lewis6991/gitsigns.nvim',
        config = function()
            require('gitsigns').setup()
        end
    }
    use { 'nvim-lua/plenary.nvim' }
    use { 'nvim-telescope/telescope.nvim', tag = '0.1.0' }
    use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }
    use { 'tpope/vim-commentary' }
    use { 'tpope/vim-surround' }
    use { 'preservim/nerdtree' }

    if installed_packer then
        require('packer').sync()
    end
end)

-- Set color scheme
vim.cmd.colorscheme('catppuccin-macchiato')

-- Highlight selection on yank
vim.api.nvim_create_autocmd('TextYankPost', {
    group = yank_group,
    pattern = '*',
    callback = function()
        vim.highlight.on_yank({
            timeout = 60
        })
    end,
})

-- Telescope mappings
local builtin = require('telescope.builtin')
vim.keymap.set('n', '<leader>ff', builtin.find_files, {})

-- Treesitter configuration
require('nvim-treesitter.configs').setup({
    ensure_installed = "all",
    sync_install = false,
    auto_install = true,
    highlight = {
        enable = true,
        additional_vim_regex_highlighting = false,
    },
})
