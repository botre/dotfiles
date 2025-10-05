return {
    -- Core LSP Configuration
    {
        'VonHeikemen/lsp-zero.nvim',
        dependencies = {
            -- LSP Support
            'neovim/nvim-lspconfig',
            'williamboman/mason.nvim',
            'williamboman/mason-lspconfig.nvim',

            -- Autocompletion
            'hrsh7th/nvim-cmp',
            'hrsh7th/cmp-nvim-lsp',
            'hrsh7th/cmp-buffer',
            'hrsh7th/cmp-path',
            'hrsh7th/cmp-nvim-lua',
        },
        config = function()
            local lsp = require('lsp-zero')

            -- Mason Setup
            require('mason').setup({})
            require('mason-lspconfig').setup({
                ensure_installed = {
                    'arduino_language_server',
                    'astro',
                    'clangd',
                    'dockerls',
                    'emmet_ls',
                    'eslint',
                    'gopls',
                    'graphql',
                    'html',
                    'jsonls',
                    'lua_ls',
                    'pyright',
                    'rust_analyzer',
                    'tailwindcss',
                    'taplo',
                    'ts_ls',
                    'vimls',
                    'yamlls',
                },
                handlers = {
                    lsp.default_setup,
                },
            })

            -- Completion Setup
            local cmp = require('cmp')
            local cmp_select = { behavior = cmp.SelectBehavior.Select }

            cmp.setup({
                sources = {
                    { name = 'copilot',  group_index = 2 },
                    { name = 'nvim_lsp', group_index = 2 },
                    { name = 'path',     group_index = 2 },
                    { name = 'buffer',   group_index = 2 },
                    { name = 'nvim_lua', group_index = 2 },
                },
                mapping = cmp.mapping.preset.insert({
                    -- Navigation mappings
                    ['<C-p>'] = cmp.mapping.select_prev_item(cmp_select),
                    ['<C-n>'] = cmp.mapping.select_next_item(cmp_select),
                    ['<C-k>'] = cmp.mapping.select_prev_item(cmp_select),
                    ['<C-j>'] = cmp.mapping.select_next_item(cmp_select),
                    ['<C-[>'] = cmp.mapping.select_prev_item(cmp_select),
                    ['<C-]>'] = cmp.mapping.select_next_item(cmp_select),

                    -- Confirm selection
                    ['<CR>'] = cmp.mapping.confirm({ select = true }),
                }),
            })

            -- LSP Keymaps
            lsp.on_attach(function(_, bufnr)
                local opts = { buffer = bufnr, remap = false }

                -- Core LSP Functions
                vim.keymap.set('n', '<leader>ga', vim.lsp.buf.code_action, opts)
                vim.keymap.set('n', '<leader>gd', vim.lsp.buf.definition, opts)
                vim.keymap.set('n', '<leader>gi', vim.lsp.buf.implementation, opts)
                vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, opts)
                vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)
                vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts)

                -- Diagnostics
                vim.keymap.set('n', '<leader>e', function()
                    vim.diagnostic.open_float(0, { scope = 'line' })
                end, opts)

                -- Error Navigation
                vim.keymap.set('n', '<leader>[e', function()
                    vim.diagnostic.goto_prev({ severity = vim.diagnostic.severity.ERROR })
                end, opts)
                vim.keymap.set('n', '<leader>]e', function()
                    vim.diagnostic.goto_next({ severity = vim.diagnostic.severity.ERROR })
                end, opts)

                -- Formatting
                vim.keymap.set('n', '<leader>==', function()
                    vim.lsp.buf.format({ async = true })
                end, opts)
            end)

            lsp.setup()
        end,
    },

    -- Formatting and Linting
    {
        'nvimtools/none-ls.nvim',
        dependencies = {
            'jay-babu/mason-null-ls.nvim',
        },
        config = function()
            require('mason-null-ls').setup({
                ensure_installed = {
                    'black',
                    'clang-format',
                    'mypy',
                    'prettierd',
                },
            })

            local null_ls = require('null-ls')
            null_ls.setup({
                sources = {
                    -- Python
                    null_ls.builtins.diagnostics.mypy,
                    null_ls.builtins.formatting.black,

                    -- C/C++
                    null_ls.builtins.formatting.clang_format,

                    -- JavaScript/TypeScript/HTML/CSS/JSON
                    null_ls.builtins.formatting.prettierd,
                },
            })
        end,
    },
}
