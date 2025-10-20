return {
    -- Core LSP Configuration
    {
        'VonHeikemen/lsp-zero.nvim',
        dependencies = {
            -- LSP Support
            'neovim/nvim-lspconfig',
            'williamboman/mason.nvim',
            'williamboman/mason-lspconfig.nvim',
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
                    function(server_name)
                        local capabilities = require('blink.cmp').get_lsp_capabilities()
                        require('lspconfig')[server_name].setup({
                            capabilities = capabilities,
                        })
                    end,
                },
            })

            -- LSP Keymaps
            lsp.on_attach(function(_, bufnr)
                -- Core LSP Functions
                vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action,
                    { buffer = bufnr, remap = false, desc = 'Code action' })
                vim.keymap.set('n', '<leader>gd', vim.lsp.buf.definition,
                    { buffer = bufnr, remap = false, desc = 'Go to definition' })
                vim.keymap.set('n', '<leader>gi', vim.lsp.buf.implementation,
                    { buffer = bufnr, remap = false, desc = 'Go to implementation' })
                vim.keymap.set('n', '<leader>gt', vim.lsp.buf.type_definition,
                    { buffer = bufnr, remap = false, desc = 'Go to type definition' })
                vim.keymap.set('n', '<leader>rn', function()
                    return ':IncRename ' .. vim.fn.expand('<cword>')
                end, { buffer = bufnr, remap = false, desc = 'Rename symbol', expr = true })
                vim.keymap.set('n', 'K', vim.lsp.buf.hover,
                    { buffer = bufnr, remap = false, desc = 'Hover documentation' })
                vim.keymap.set('n', 'gd', vim.lsp.buf.definition,
                    { buffer = bufnr, remap = false, desc = 'Go to definition' })

                -- Diagnostics
                vim.keymap.set('n', '<leader>e', function()
                    vim.diagnostic.open_float(0, { scope = 'line' })
                end, { buffer = bufnr, remap = false, desc = 'Show error' })

                -- Error Navigation
                vim.keymap.set('n', '<leader>[e', function()
                    vim.diagnostic.goto_prev({ severity = vim.diagnostic.severity.ERROR })
                end, { buffer = bufnr, remap = false, desc = 'Previous error' })
                vim.keymap.set('n', '<leader>]e', function()
                    vim.diagnostic.goto_next({ severity = vim.diagnostic.severity.ERROR })
                end, { buffer = bufnr, remap = false, desc = 'Next error' })

                -- Formatting
                vim.keymap.set('n', '<leader>==', function()
                    vim.lsp.buf.format({ async = true })
                end, { buffer = bufnr, remap = false, desc = 'Format' })
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
    {
        'smjonas/inc-rename.nvim',
        config = function()
            require('inc_rename').setup()
        end,
    },
}
