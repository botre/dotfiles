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
    use {
        'nvim-lualine/lualine.nvim',
        requires = { 'kyazdani42/nvim-web-devicons', opt = true }
    }
    use { 'nvim-lua/plenary.nvim' }
    use { 'nvim-telescope/telescope.nvim', tag = '0.1.0' }
    use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }
    use { 'preservim/nerdtree' }
    use { 'tpope/vim-commentary' }
    use { 'tpope/vim-eunuch' }
    use { 'tpope/vim-fugitive' }
    use { 'tpope/vim-surround' }
    use {
        'VonHeikemen/lsp-zero.nvim',
        requires = {
            -- LSP support
            { 'neovim/nvim-lspconfig' },
            { 'williamboman/mason.nvim' },
            { 'williamboman/mason-lspconfig.nvim' },

            -- Autocompletion
            { 'hrsh7th/nvim-cmp' },
            { 'hrsh7th/cmp-buffer' },
            { 'hrsh7th/cmp-path' },
            { 'saadparwaiz1/cmp_luasnip' },
            { 'hrsh7th/cmp-nvim-lsp' },
            { 'hrsh7th/cmp-nvim-lua' },

            -- Snippets
            { 'L3MON4D3/LuaSnip' },
            { 'rafamadriz/friendly-snippets' },
        }
    }

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
        vim.highlight.on_yank()
    end,
})

-- File utilities
vim.keymap.set('n', '<leader>rf', ':Rename ', {})

-- Git decorations
require('gitsigns').setup()

-- Status line
require('lualine').setup()

-- Telescope
local builtin = require('telescope.builtin')
vim.keymap.set('n', '<leader>ff', builtin.find_files, {})
vim.keymap.set('n', '<leader>fg', builtin.live_grep, {})
vim.keymap.set('n', '<leader>fr', builtin.oldfiles, {})
vim.keymap.set('n', '<leader>fu', builtin.lsp_references, {})

-- Treesitter
require('nvim-treesitter.configs').setup({
    ensure_installed = 'all',
    sync_install = false,
    auto_install = true,
    highlight = {
        enable = true,
        additional_vim_regex_highlighting = false,
    },
})

-- LSP
local lsp = require('lsp-zero')

lsp.preset('recommended')

lsp.on_attach(function(_, bufnr)
    local options = { buffer = bufnr, remap = false }
    -- Format the buffer
    vim.keymap.set('n', '<leader>==', function()
        vim.lsp.buf.format({ async = true })
    end, options)
    vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, options)
    vim.keymap.set('n', 'K', vim.lsp.buf.hover, options)
    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, options)
end)

lsp.setup()

-- Inline diagnostic messages
vim.diagnostic.config({
    virtual_text = true,
})