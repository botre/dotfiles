-- Source .vimrc
vim.api.nvim_exec(
        [[
set runtimepath^=~/.vim runtimepath+=~/.vim/after
let &packpath=&runtimepath
source ~/.vimrc
        ]], false)

-- Install vim-plug
vim.api.nvim_exec(
        [[
if empty(glob('~/.config/nvim/autoload/plug.vim'))
    silent !curl -fLo ~/.config/nvim/autoload/plug.vim --create-dirs
        \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
    autocmd VimEnter * PlugInstall
endif
        ]], false)

-- Install plugins
vim.api.nvim_exec(
        [[
call plug#begin()
    Plug 'adelarsq/vim-matchit'
    Plug 'catppuccin/nvim', { 'as': 'catppuccin' }
    Plug 'kana/vim-textobj-entire'
    Plug 'kana/vim-textobj-user'
    Plug 'nvim-lua/plenary.nvim'
    Plug 'nvim-telescope/telescope.nvim', { 'tag': '0.1.0' }
    Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}
    Plug 'tpope/vim-commentary'
    Plug 'tpope/vim-surround'
    Plug 'preservim/nerdtree'
call plug#end()
        ]], false)

-- Set color scheme
vim.api.nvim_exec(
        [[
colorscheme catppuccin-macchiato
        ]], false)

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
vim.api.nvim_exec(
        [[
nnoremap <leader>ff <cmd>Telescope find_files<cr>
        ]], false)

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

