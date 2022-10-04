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
    Plug 'adelarsq/vim-matchit'
    Plug 'dracula/vim', { 'as': 'dracula' }
    Plug 'kana/vim-textobj-entire'
    Plug 'kana/vim-textobj-user'
    Plug 'tpope/vim-commentary'
    Plug 'tpope/vim-surround'
call plug#end()

" Set color scheme
colorscheme dracula

" Highlight selection on yank
au TextYankPost * silent! lua vim.highlight.on_yank()
