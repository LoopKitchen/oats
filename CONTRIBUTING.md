# Contributing to OATSJS

First off, thank you for considering contributing to OATSJS! It's people like you that make OATSJS such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by the [OATS Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [hari@loopkitchen.com](mailto:hari@loopkitchen.com).

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for OATSJS. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

**Before Submitting A Bug Report**

* **Check the [documentation](https://github.com/loopkitchen/oats#readme)** for a list of common questions and problems.
* **Check the [issues](https://github.com/loopkitchen/oats/issues)** to see if the problem has already been reported. If it has **and the issue is still open**, add a comment to the existing issue instead of opening a new one.

**How Do I Submit A (Good) Bug Report?**

Bugs are tracked as [GitHub issues](https://github.com/loopkitchen/oats/issues). Create an issue and provide the following information:

* **Use a clear and descriptive title** for the issue to identify the problem.
* **Describe the exact steps which reproduce the problem** in as many details as possible.
* **Provide specific examples to demonstrate the steps**. Include links to files or GitHub projects, or copy/pasteable snippets, which you use in those examples.
* **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior.
* **Explain which behavior you expected to see instead and why.**
* **Include screenshots and animated GIFs** which show you following the described steps and clearly demonstrate the problem.
* **If the problem is related to performance or memory**, include a CPU profile capture with your report.
* **Include your configuration file** (oats.config.json) with sensitive information redacted.

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for OATSJS, including completely new features and minor improvements to existing functionality.

**Before Submitting An Enhancement Suggestion**

* **Check the [documentation](https://github.com/loopkitchen/oats#readme)** to see if the enhancement is already available.
* **Check the [issues](https://github.com/loopkitchen/oats/issues)** to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.

**How Do I Submit A (Good) Enhancement Suggestion?**

Enhancement suggestions are tracked as [GitHub issues](https://github.com/loopkitchen/oats/issues). Create an issue and provide the following information:

* **Use a clear and descriptive title** for the issue to identify the suggestion.
* **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
* **Provide specific examples to demonstrate the steps**. Include copy/pasteable snippets which you use in those examples.
* **Describe the current behavior** and **explain which behavior you expected to see instead** and why.
* **Include screenshots and animated GIFs** which help you demonstrate the steps or point out the part of OATSJS which the suggestion is related to.
* **Explain why this enhancement would be useful** to most OATSJS users.

### Your First Code Contribution

Unsure where to begin contributing to OATSJS? You can start by looking through these `beginner` and `help-wanted` issues:

* [Beginner issues][beginner] - issues which should only require a few lines of code, and a test or two.
* [Help wanted issues][help-wanted] - issues which should be a bit more involved than `beginner` issues.

### Pull Requests

The process described here has several goals:

- Maintain OATSJS's quality
- Fix problems that are important to users
- Engage the community in working toward the best possible OATSJS
- Enable a sustainable system for OATSJS's maintainers to review contributions

Please follow these steps to have your contribution considered by the maintainers:

1. Follow all instructions in [the template](PULL_REQUEST_TEMPLATE.md)
2. Follow the [styleguides](#styleguides)
3. After you submit your pull request, verify that all [status checks](https://help.github.com/articles/about-status-checks/) are passing

## Development Setup

1. Fork the repo and create your branch from `main`.
2. Clone your fork:
   ```bash
   git clone https://github.com/loopkitchen/oats.git
   cd oats
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Make sure the tests pass:
   ```bash
   npm test
   ```
5. Make your changes and add tests for your changes.
6. Ensure the test suite passes:
   ```bash
   npm test
   ```
7. Run the linter:
   ```bash
   npm run lint
   ```
8. Run type checking:
   ```bash
   npm run typecheck
   ```

## Styleguides

### Git Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line
* Consider starting the commit message with an applicable emoji:
    * 🎨 `:art:` when improving the format/structure of the code
    * 🐎 `:racehorse:` when improving performance
    * 🚱 `:non-potable_water:` when plugging memory leaks
    * 📝 `:memo:` when writing docs
    * 🐧 `:penguin:` when fixing something on Linux
    * 🍎 `:apple:` when fixing something on macOS
    * 🏁 `:checkered_flag:` when fixing something on Windows
    * 🐛 `:bug:` when fixing a bug
    * 🔥 `:fire:` when removing code or files
    * 💚 `:green_heart:` when fixing the CI build
    * ✅ `:white_check_mark:` when adding tests
    * 🔒 `:lock:` when dealing with security
    * ⬆️ `:arrow_up:` when upgrading dependencies
    * ⬇️ `:arrow_down:` when downgrading dependencies
    * 👕 `:shirt:` when removing linter warnings

### TypeScript Styleguide

All TypeScript must adhere to the [TypeScript Style Guide](https://github.com/basarat/typescript-book/blob/master/docs/styleguide/styleguide.md) and be formatted with Prettier.

* Prefer interfaces over type aliases
* Use explicit return types for public methods
* Use readonly where applicable
* Avoid `any` - use `unknown` if you must
* Document all public APIs with TSDoc comments
* Use descriptive variable names

### Documentation Styleguide

* Use [Markdown](https://daringfireball.net/projects/markdown).
* Reference functions and classes with `` `backticks` ``.
* Use TSDoc for code documentation:
  ```typescript
  /**
   * Validates an OATS configuration object
   * 
   * @param config - The configuration to validate
   * @returns Validation result with errors and warnings
   * @throws {ConfigError} If the configuration is invalid
   * 
   * @example
   * ```typescript
   * const result = validateConfig(config);
   * if (!result.valid) {
   *   console.error(result.errors);
   * }
   * ```
   */
  ```

## Testing

* Write tests for any new functionality
* Update tests for any changed functionality
* Ensure all tests pass before submitting PR
* Aim for >80% code coverage
* Use descriptive test names:
  ```typescript
  describe('ConfigValidator', () => {
    describe('validateConfig', () => {
      it('should return valid for a complete configuration', () => {
        // test implementation
      });
      
      it('should return errors for missing required fields', () => {
        // test implementation
      });
    });
  });
  ```

## Additional Notes

### Issue and Pull Request Labels

This section lists the labels we use to help us track and manage issues and pull requests.

* `bug` - Issues that are bugs.
* `enhancement` - Issues that are feature requests.
* `documentation` - Issues for improving or updating our documentation.
* `good first issue` - Good for newcomers.
* `help wanted` - Extra attention is needed.
* `question` - Further information is requested.
* `wontfix` - This will not be worked on.
* `duplicate` - This issue or pull request already exists.
* `invalid` - This doesn't seem right.

[beginner]:https://github.com/loopkitchen/oats/issues?q=is%3Aissue+is%3Aopen+label%3Abeginner
[help-wanted]:https://github.com/loopkitchen/oats/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22