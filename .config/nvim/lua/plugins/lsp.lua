return {
    {
        'neovim/nvim-lspconfig',
        dependencies = {
            'mason-org/mason.nvim',
            'mason-org/mason-lspconfig.nvim',
            'saghen/blink.cmp',
        },
        config = function()
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
                automatic_enable = true,
            })

            -- Default capabilities for every LSP server
            vim.lsp.config('*', {
                capabilities = require('blink.cmp').get_lsp_capabilities(),
            })

            -- LSP Keymaps (set on attach)
            vim.api.nvim_create_autocmd('LspAttach', {
                callback = function(args)
                    local bufnr = args.buf
                    local opts = function(desc)
                        return { buffer = bufnr, remap = false, desc = desc }
                    end

                    -- Core LSP Functions
                    vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, opts('Code action'))
                    vim.keymap.set('n', '<leader>gd', vim.lsp.buf.definition, opts('Go to definition'))
                    vim.keymap.set('n', '<leader>gi', vim.lsp.buf.implementation, opts('Go to implementation'))
                    vim.keymap.set('n', '<leader>gt', vim.lsp.buf.type_definition, opts('Go to type definition'))
                    vim.keymap.set('n', '<leader>rn', function()
                        return ':IncRename ' .. vim.fn.expand('<cword>')
                    end, vim.tbl_extend('force', opts('Rename symbol'), { expr = true }))
                    vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts('Hover documentation'))
                    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts('Go to definition'))

                    -- Inlay hints toggle
                    vim.keymap.set('n', '<leader>ih', function()
                        vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = bufnr }),
                            { bufnr = bufnr })
                    end, opts('Toggle inlay hints'))

                    -- Diagnostics
                    vim.keymap.set('n', '<leader>e', function()
                        vim.diagnostic.open_float(0, { scope = 'line' })
                    end, opts('Show error'))

                    -- Error Navigation
                    vim.keymap.set('n', '<leader>[e', function()
                        vim.diagnostic.jump({ count = -1, severity = vim.diagnostic.severity.ERROR })
                    end, opts('Previous error'))
                    vim.keymap.set('n', '<leader>]e', function()
                        vim.diagnostic.jump({ count = 1, severity = vim.diagnostic.severity.ERROR })
                    end, opts('Next error'))
                end,
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
