return {

    { 'adelarsq/vim-matchit' },
    {
        'jiaoshijie/undotree',
        opts = {},
        keys = {
            { '<leader>fh', "<cmd>lua require('undotree').toggle()<cr>", desc = "Toggle file history" },
        },
    },
    {
        'kana/vim-textobj-entire',
        dependencies = {
            'kana/vim-textobj-user'
        }
    },
    {
        'letieu/btw.nvim',
        config = function()
            require('btw').setup({
                text = 'Neovim BTW',
            })
        end
    },
    { 'tpope/vim-commentary' },
    { 'tpope/vim-eunuch' },
    { 'tpope/vim-surround' },
    { 'unblevable/quick-scope' },
    {
        'windwp/nvim-autopairs',
        event = 'InsertEnter',
        config = true,
    },

}
