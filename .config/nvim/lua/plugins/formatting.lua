return {
    {
        'stevearc/conform.nvim',
        event = { 'BufReadPre', 'BufNewFile' },
        cmd = { 'ConformInfo' },
        config = function()
            require('conform').setup({
                formatters_by_ft = {
                    python = { 'black' },
                    c = { 'clang-format' },
                    cpp = { 'clang-format' },
                    javascript = { 'prettierd' },
                    javascriptreact = { 'prettierd' },
                    typescript = { 'prettierd' },
                    typescriptreact = { 'prettierd' },
                    html = { 'prettierd' },
                    css = { 'prettierd' },
                    json = { 'prettierd' },
                    jsonc = { 'prettierd' },
                    yaml = { 'prettierd' },
                    graphql = { 'prettierd' },
                    markdown = { 'prettierd' },
                },
            })

            vim.keymap.set({ 'n', 'v' }, '<leader>==', function()
                require('conform').format({ async = true, lsp_format = 'fallback' })
            end, { desc = 'Format' })
        end,
    },
    {
        'WhoIsSethDaniel/mason-tool-installer.nvim',
        dependencies = { 'mason-org/mason.nvim' },
        config = function()
            require('mason-tool-installer').setup({
                ensure_installed = {
                    'black',
                    'clang-format',
                    'prettierd',
                },
                run_on_start = true,
            })
        end,
    },
}
