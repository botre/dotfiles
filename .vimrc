" Precede each line with its line number
set number

" Show the line number relative to the line with the cursor in front of each line
set relativenumber

" Ignore case in search patterns
set smartcase

" Override the 'ignorecase' option if the search pattern contains upper case characters
set ignorecase

" Use <Space> as <Leader>
let mapleader = " "

" Disable arrow keys
noremap <Up> <Nop>
noremap <Down> <Nop>
noremap <Left> <Nop>
noremap <Right> <Nop>

" Black hole variants
nnoremap <leader>c "_c
vnoremap <leader>c "_c
nnoremap <leader>d "_d
vnoremap <leader>d "_d
nnoremap <leader>x "_x
vnoremap <leader>x "_x