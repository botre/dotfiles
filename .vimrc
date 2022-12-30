" Enable true colors support
set termguicolors

" Faster updates
set updatetime=750

" Show mode
set showmode

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

" Remove <Space> functionality
noremap <Space> <NOP>

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
nnoremap <leader>s "_s
vnoremap <leader>s "_s
nnoremap <leader>x "_x
vnoremap <leader>x "_x

" Add a new line below the current line, stay in command mode
nmap <leader>o o<Esc>
" Add a new line above the current line, stay in command mode
nmap <leader>O O<Esc>

" Make Y to work from the cursor to the end of line (which is more logical, but not vi-compatible)
map Y y$

" Move lines of text vertically
vnoremap J :m '>+1<CR>gv=gv
vnoremap K :m '<-2<CR>gv=gv

" Toggle search highlights
nmap <silent> <leader><space> :set hlsearch!<cr>

" Toggle between absolute and relative line numbers
nnoremap <leader>n :call NumberToggle()<cr>
   function! NumberToggle()
     if(&relativenumber == 1)
       set norelativenumber
     else
       set relativenumber
     endif
   endfunction