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
    use { 'akinsho/bufferline.nvim', requires = 'nvim-tree/nvim-web-devicons' }
    use { 'catppuccin/nvim', as = 'catppuccin' }
    use { 'jiangmiao/auto-pairs' }
    use { 'kana/vim-textobj-entire' }
    use { 'kana/vim-textobj-user' }
    use({
        'kdheepak/lazygit.nvim',
    })
    use {
        'lewis6991/gitsigns.nvim',
        config = function()
            require('gitsigns').setup()
        end
    }
    use { 'letieu/btw.nvim' }
    use {
        'nvim-lualine/lualine.nvim',
        requires = { 'kyazdani42/nvim-web-devicons' }
    }
    use { 'nvim-lua/plenary.nvim' }
    use { 'nvim-telescope/telescope.nvim' }
    use { 'nvim-tree/nvim-web-devicons' }
    use {
        'nvim-tree/nvim-tree.lua',
    }
    use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }
    use {
        'stevearc/oil.nvim', config = function()
            require('oil').setup()
        end
    }
    use { 'tpope/vim-commentary' }
    use { 'tpope/vim-eunuch' }
    use { 'tpope/vim-fugitive' }
    use { 'tpope/vim-surround' }
    use { 'unblevable/quick-scope' }
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
        }
    }

    use {
        'jose-elias-alvarez/null-ls.nvim',
        'jay-babu/mason-null-ls.nvim',
    }

    use {
        'zbirenbaum/copilot.lua',
        cmd = 'Copilot',
        config = function()
            require('copilot').setup({
                suggestion = { enabled = false },
                panel = { enabled = false },
            })
        end,
    }
    use {
        'zbirenbaum/copilot-cmp',
        after = { 'copilot.lua' },
        config = function()
            require('copilot_cmp').setup()
        end
    }

    if installed_packer then
        require('packer').sync()
    end
end)

-- Start message
require('btw').setup({
    text = 'Neovim BTW',
})

-- Color scheme
require('catppuccin').setup({
    flavour = 'latte',
    integrations = {
        mason = true,
        native_lsp = {
            enabled = true
        },
        nvimtree = true,
        telescope = true,
    }
})
vim.cmd.colorscheme('catppuccin-latte')

-- Highlight selection on yank
vim.api.nvim_create_autocmd('TextYankPost', {
    group = yank_group,
    pattern = '*',
    callback = function()
        vim.highlight.on_yank()
    end,
})

-- File utilities
vim.keymap.set('n', '<leader>rf', ':Rename ', {}) -- The whitespace is intentional

-- Git
vim.keymap.set('n', '<leader>gg', ':LazyGit<CR>', {})

-- Git decorations
require('gitsigns').setup()

-- Status line
require('lualine').setup({
    options = {
        theme = 'catppuccin',
        disabled_filetypes = { 'packer', 'NvimTree' },
    }
})

-- Buffers
require('bufferline').setup({
    options = {
        diagnostics = 'nvim_lsp',
    }
})
vim.keymap.set('n', '<leader>[t', ':bprevious<CR>')
vim.keymap.set('n', '<leader>]t', ':bnext<CR>')
vim.keymap.set('n', '<tab>[', ':bprevious<CR>')
vim.keymap.set('n', '<tab>]', ':bnext<CR>')
vim.keymap.set('n', '<tab>a', ':enew<CR>')
vim.keymap.set('n', '<tab>d', ':bdelete<CR>')
vim.keymap.set('n', '<tab>1', ':BufferLineGoToBuffer 1<CR>')
vim.keymap.set('n', '<tab>2', ':BufferLineGoToBuffer 2<CR>')
vim.keymap.set('n', '<tab>3', ':BufferLineGoToBuffer 3<CR>')
vim.keymap.set('n', '<tab>4', ':BufferLineGoToBuffer 4<CR>')
vim.keymap.set('n', '<tab>5', ':BufferLineGoToBuffer 5<CR>')
vim.keymap.set('n', '<tab>6', ':BufferLineGoToBuffer 6<CR>')
vim.keymap.set('n', '<tab>7', ':BufferLineGoToBuffer 7<CR>')
vim.keymap.set('n', '<tab>8', ':BufferLineGoToBuffer 8<CR>')
vim.keymap.set('n', '<tab>9', ':BufferLineGoToBuffer 9<CR>')

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

require('mason').setup({})
require('mason-lspconfig').setup({
    ensure_installed = {
        'dockerls',
        'emmet_ls',
        'eslint',
        'graphql',
        'html',
        'jsonls',
        'lua_ls',
        'pyright',
        'rust_analyzer',
        'taplo',
        'ts_ls',
        'vimls',
        'yamlls',
    }
,
    handlers = {
        lsp.default_setup,
    },
})

require('mason-null-ls').setup {
    ensure_installed = {
        'black',
        'mypy',
        'prettier',
        'ruff',
    }
}

local null_ls = require('null-ls')
null_ls.setup({
    sources = {
        null_ls.builtins.formatting.black,
        null_ls.builtins.formatting.prettier,
        null_ls.builtins.diagnostics.mypy,
        null_ls.builtins.diagnostics.ruff,
    }
})

local cmp = require('cmp')
local cmp_select = { behavior = cmp.SelectBehavior.Select }
cmp.setup({
    mapping = cmp.mapping.preset.insert({
        ['<C-p>'] = cmp.mapping.select_prev_item(cmp_select),
        ['<C-n>'] = cmp.mapping.select_next_item(cmp_select),

        ['<C-[>'] = cmp.mapping.select_prev_item(cmp_select),
        ['<C-]>'] = cmp.mapping.select_next_item(cmp_select),

        ['<C-k>'] = cmp.mapping.select_prev_item(cmp_select),
        ['<C-j>'] = cmp.mapping.select_next_item(cmp_select),

        ['<CR>'] = cmp.mapping.confirm({ select = true }),

        ['<C-Space>'] = cmp.mapping.complete(),
    }),
    sources = {
        { name = 'copilot', group_index = 2 },
        { name = 'nvim_lsp', group_index = 2 },
        { name = 'path', group_index = 2 },
    },
})

lsp.on_attach(function(_, bufnr)
    local options = { buffer = bufnr, remap = false }
    -- Format the buffer
    vim.keymap.set('n', '<leader>==', function()
        vim.lsp.buf.format({ async = true })
    end, options)

    -- Change navigation
    vim.keymap.set('n', '<leader>[c', function()
        -- TODO: jump to previous VCS change marker
    end, options)
    vim.keymap.set('n', '<leader>]c', function()
        -- TODO: jump to next VCS change marker
    end, options)

    -- Error navigation
    vim.keymap.set('n', '<leader>[e', function()
        vim.diagnostic.goto_prev({ severity = vim.diagnostic.severity.ERROR })
    end, options)
    vim.keymap.set('n', '<leader>]e', function()
        vim.diagnostic.goto_next({ severity = vim.diagnostic.severity.ERROR })
    end, options)

    -- Function navigation
    vim.keymap.set('n', '<leader>[f', function()
        -- TODO: jump to previous function
    end, options)
    vim.keymap.set('n', '<leader>]f', function()
        -- TODO: jump to next function
    end, options)

    -- Rename symbol
    vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, options)

    -- Show documentation
    vim.keymap.set('n', 'K', vim.lsp.buf.hover, options)

    -- Show diagnostics window for current line
    vim.keymap.set('n', '<leader>e', function()
        vim.diagnostic.open_float(0, { scope = 'line' })
    end)

    -- Go to definition
    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, options)
end)

lsp.setup()

-- Inline diagnostic messages
vim.diagnostic.config({
    virtual_text = true,
    update_in_insert = true,
})

-- File tree
local function map(m, k, v)
    vim.keymap.set(m, k, v, { silent = true })
end

map('n', '<C-t>', '<CMD>NvimTreeToggle<CR>')
map('x', '<C-t>', '<CMD>NvimTreeToggle<CR>')

map('n', '<leader>tt', '<CMD>NvimTreeToggle<CR>')
map('x', '<leader>tt', '<CMD>NvimTreeToggle<CR>')

map('n', '<leader>tf', '<CMD>NvimTreeFindFileToggle<CR>')
map('x', '<leader>tf', '<CMD>NvimTreeFindFileToggle<CR>')

require('nvim-tree').setup()
require('nvim-web-devicons').setup()
