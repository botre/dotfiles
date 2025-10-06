return {
    {
        'letieu/btw.nvim',
        config = function()
            require('btw').setup({
                text = 'Neovim BTW',
            })
        end
    },
    { 'adelarsq/vim-matchit' },
    {
        'kana/vim-textobj-entire',
        dependencies = {
            'kana/vim-textobj-user'
        }
    },
    { 'tpope/vim-commentary' },
    { 'tpope/vim-eunuch' },
    { 'tpope/vim-surround' },
    { 'unblevable/quick-scope' },
    {
        'windwp/nvim-autopairs',
        event = 'InsertEnter',
        config = true,
    }
}
