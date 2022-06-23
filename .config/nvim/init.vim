" Source .vimrc
set runtimepath^=~/.vim runtimepath+=~/.vim/after
let &packpath=&runtimepath
source ~/.vimrc

" Highlight selection on yank
au TextYankPost * silent! lua vim.highlight.on_yank()
