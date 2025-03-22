#!/bin/bash
# upload-to-github.sh
# This script initializes a git repository, commits all files, and pushes them to GitHub using your PAT.
# It will prompt for your GitHub username, repository name, and PAT.

# Prompt for GitHub information
read -p "Enter your GitHub username: " username
read -p "Enter your GitHub repository name: " repo
read -s -p "Enter your GitHub Personal Access Token (PAT): " token
echo ""

# Build the remote URL with the PAT (Note: be cautious with exposing your token)
remoteUrl="https://${token}@github.com/${username}/${repo}.git"

# Check if a Git repository already exists; if not, initialize one.
if [ ! -d ".git" ]; then
  git init
  echo "Initialized a new Git repository."
fi

# Add all files to the repository and commit.
git add .
git commit -m "Initial commit"

# Rename the current branch to main if it isn’t already.
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
  git branch -M main
fi

# Add the remote repository using the PAT for authentication.
git remote remove origin 2>/dev/null
git remote add origin "$remoteUrl"

# Push the changes to GitHub.
git push -u origin main

echo "Upload complete!"
