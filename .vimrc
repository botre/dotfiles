" Enable true colors support
set termguicolors

" Precede each line with its line number
set number

" Show the line number relative to the line with the cursor in front of each line
set relativenumber

" Show a few lines of context around the cursor
set scrolloff=5

" Enable cursor blink in all modes
set guicursor+=a:-blinkwait175-blinkoff150-blinkon175

" Ignore case in search patterns
set smartcase

" Override the 'ignorecase' option if the search pattern contains upper case characters
set ignorecase

" Causes all text matching the current search to be highlighted
set hlsearch

" While typing a search command, show where the pattern, as it was typed so far, matches
set incsearch

" Spelling
set spelllang=en

" Yank to system clipboard
set clipboard=unnamed

" Use <Space> as <Leader>
let mapleader = " "

" Disable arrow keys
noremap <Up> <Nop>
noremap <Down> <Nop>
noremap <Left> <Nop>
noremap <Right> <Nop>

" Disable backspace and carriage return keys
noremap <Backspace> <Nop>
noremap <CR> <Nop>

" Black hole variants
nnoremap <leader>c "_c
vnoremap <leader>c "_c
nnoremap <leader>d "_d
vnoremap <leader>d "_d
nnoremap <leader>x "_x
vnoremap <leader>x "_x
nnoremap <leader>s "_s
vnoremap <leader>s "_s

" Make Y to work from the cursor to the end of line (which is more logical, but not vi-compatible)
map Y y$

" NERDTree mappings
nnoremap <C-n> :NERDTree<CR>
nnoremap <C-t> :NERDTreeToggle<CR>
nnoremap <C-f> :NERDTreeFind<CR>