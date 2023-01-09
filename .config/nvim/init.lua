-- Source .vimrc
vim.api.nvim_exec(
        [[
        set runtimepath^=~/.vim runtimepath+=~/.vim/after
        let &packpath=&runtimepath
        source ~/.vimrc
        ]], false)

-- Disable netrw
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

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
    use {
        'nvim-tree/nvim-tree.lua',
        requires = {
            'nvim-tree/nvim-web-devicons',
        },
    }
    use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }
    use { 'tpope/vim-commentary' }
    use { 'tpope/vim-eunuch' }
    use { 'tpope/vim-fugitive' }
    use { 'tpope/vim-surround' }
    use {
        'VonHeikemen/lsp-zero.nvim',
        requires = {
            -- LSP support
            { 'neovim/nvim-lspconfig' },
            { 'williamboman/mason-lspconfig.nvim' },
            { 'williamboman/mason.nvim' },

            -- Autocompletion
            { 'hrsh7th/cmp-buffer' },
            { 'hrsh7th/cmp-nvim-lsp' },
            { 'hrsh7th/cmp-nvim-lua' },
            { 'hrsh7th/cmp-path' },
            { 'hrsh7th/nvim-cmp' },
            { 'saadparwaiz1/cmp_luasnip' },

            -- Snippets
            { 'L3MON4D3/LuaSnip' },
            { 'rafamadriz/friendly-snippets' },
        }
    }

    if installed_packer then
        require('packer').sync()
    end
end)

-- Color scheme
require('catppuccin').setup({
    flavour = 'macchiato',
    integrations = {
        mason = true,
        native_lsp = {
            enabled = true
        },
        nvimtree = true,
        telescope = true,
    }
})
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
require('lualine').setup({
    options = {
        theme = 'catppuccin',
        disabled_filetypes = { 'packer', 'NvimTree' },
    },
})

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

lsp.ensure_installed(
        {
            'dockerls',
            'emmet_ls',
            'eslint',
            'graphql',
            'html',
            'jsonls',
            'rust_analyzer',
            'sumneko_lua',
            'taplo',
            'tsserver',
            'vimls',
            'yamlls',
        }
)

local cmp = require('cmp')
local cmp_select = { behavior = cmp.SelectBehavior.Select }
local cmp_mappings = lsp.defaults.cmp_mappings({
    ['<C-p>'] = cmp.mapping.select_prev_item(cmp_select),
    ['<C-n>'] = cmp.mapping.select_next_item(cmp_select),
    ['<CR>'] = cmp.mapping.confirm({ select = true }),
    ['<C-Space>'] = cmp.mapping.complete(),
})
lsp.setup_nvim_cmp({
    mapping = cmp_mappings
})

lsp.on_attach(function(_, bufnr)
    local options = { buffer = bufnr, remap = false }
    -- Format the buffer
    vim.keymap.set('n', '<leader>==', function()
        vim.lsp.buf.format({ async = true })
    end, options)
    vim.keymap.set('n', '<leader>[e', function()
        vim.diagnostic.goto_prev({ severity = vim.diagnostic.severity.ERROR })
    end, options)
    vim.keymap.set('n', '<leader>]e', function()
        vim.diagnostic.goto_next({ severity = vim.diagnostic.severity.ERROR })
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

-- File tree
local function map(m, k, v)
    vim.keymap.set(m, k, v, { silent = true })
end

map('n', '<C-t>', '<CMD>NvimTreeToggle<CR>')
map('i', '<C-t>', '<CMD>NvimTreeToggle<CR>')
map('x', '<C-t>', '<CMD>NvimTreeToggle<CR>')

map('n', '<C-f>', '<CMD>NvimTreeFindFileToggle<CR>')
map('i', '<C-f>', '<CMD>NvimTreeFindFileToggle<CR>')
map('x', '<C-f>', '<CMD>NvimTreeFindFileToggle<CR>')

require('nvim-tree').setup({
    view = {
        mappings = {
            list = {
                { key = '<C-t>', action = '' },
            },
        },
    },
})