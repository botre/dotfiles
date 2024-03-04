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

" Add a new line below the current line, stay in command mode
nmap <leader>o o<Esc>

" Add a new line above the current line, stay in command mode
nmap <leader>O O<Esc>

" Make Y to work from the cursor to the end of line
map Y y$`

" Move lines of text vertically, in visual mode
vnoremap J :m '>+1<CR>gv=gv
vnoremap K :m '<-2<CR>gv=gv

" Go to the beginning of the line (Kakoune)
nnoremap gh 0

" Go to the end of the line (Kakoune)
nnoremap gl $

" Tabs
noremap <leader>[t gT
noremap <leader>]t gt
noremap <leader><tab>[ gT
noremap <leader><tab>] gt
noremap <leader><tab>1 1gt
noremap <leader><tab>2 2gt
noremap <leader><tab>3 3gt
noremap <leader><tab>4 4gt
noremap <leader><tab>5 5gt
noremap <leader><tab>6 6gt
noremap <leader><tab>7 7gt
noremap <leader><tab>8 8gt
noremap <leader><tab>9 :tablast<cr>
noremap <leader><tab>d :tabclose<cr>

" Toggle search highlights
nmap <silent> <leader><space> :set hlsearch!<cr>

" Improved window splitting
noremap <C-w>- <C-w>s
noremap <C-w>\ <C-w>v

" Toggle between absolute and relative line numbers
nnoremap <leader>n :call NumberToggle()<cr>
   function! NumberToggle()
     if(&relativenumber == 1)
       set norelativenumber
     else
       set relativenumber
     endif
   endfunction

" Trigger a quick-scope highlight in the appropriate direction when pressing f, F, t and T keys
let g:qs_highlight_on_keys = ['f', 'F', 't', 'T']
