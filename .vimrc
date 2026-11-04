set termguicolors

" Faster updates
set updatetime=750

set showmode

set number

" Relative line numbers
set relativenumber

" Show a few lines of context around the cursor
set scrolloff=5

" Enable cursor blink in all modes
set guicursor+=a:-blinkwait175-blinkoff150-blinkon175

" Match case when the search pattern contains uppercase characters
set smartcase

set ignorecase

" Highlight search matches
set hlsearch

" Preview search matches as the pattern changes
set incsearch

" Spelling
set spelllang=en

" Yank to system clipboard
set clipboard=unnamedplus

noremap <Space> <NOP>

let mapleader = " "

inoremap <Esc> <C-c>

inoremap jj <Esc>

noremap <Up> <Nop>
noremap <Down> <Nop>
noremap <Left> <Nop>
noremap <Right> <Nop>

noremap <Backspace> <Nop>
noremap <CR> <Nop>

" Black hole variants (normal)
nnoremap <leader>C "_C
nnoremap <leader>D "_D
nnoremap <leader>S "_S
nnoremap <leader>X "_X
nnoremap <leader>c "_c
nnoremap <leader>d "_d
nnoremap <leader>s "_s
nnoremap <leader>x "_x

" Black hole variants (visual)
vnoremap <leader>c "_c
vnoremap <leader>d "_d
vnoremap <leader>s "_s
vnoremap <leader>x "_x

" Make Y yank from the cursor to the end of the line, like D and C
map Y y$

" Move lines of text vertically, in visual mode
vnoremap J :m '>+1<CR>gv=gv
vnoremap K :m '<-2<CR>gv=gv

nmap <silent> <leader>h :set hlsearch!<cr>

" Window splits
noremap <leader>w- <C-w>s
noremap <leader>w\ <C-w>v

" Toggle between absolute and relative line numbers
nnoremap <leader>n :call NumberToggle()<cr>
   function! NumberToggle()
     if(&relativenumber == 1)
       set norelativenumber
     else
       set relativenumber
     endif
   endfunction

" Trigger quick-scope highlights with f, F, t, and T
let g:qs_highlight_on_keys = ['f', 'F', 't', 'T']
