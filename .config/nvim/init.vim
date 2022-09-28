" Source .vimrc
set runtimepath^=~/.vim runtimepath+=~/.vim/after
let &packpath=&runtimepath
source ~/.vimrc

" Install vim-plug
if empty(glob('~/.config/nvim/autoload/plug.vim'))
    silent !curl -fLo ~/.config/nvim/autoload/plug.vim --create-dirs
        \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
    autocmd VimEnter * PlugInstall
endif

" Plugins
call plug#begin()
    " Color scheme
    Plug 'catppuccin/nvim', {'as': 'catppuccin'}
call plug#end()

" Set color scheme
colorscheme catppuccin

" Highlight selection on yank
au TextYankPost * silent! lua vim.highlight.on_yank()
