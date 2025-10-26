vim.keymap.set('n', '<leader>rf', ':Rename ', { desc = 'Rename file' }) -- The whitespace is intentional
vim.keymap.set('n', '<leader>cp', ':let @+ = expand("%")<CR>', { desc = 'Copy path' })
