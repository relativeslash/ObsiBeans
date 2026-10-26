// Enforces ENG-BUILD-006: external dependencies take their versions from the default catalog in .yarnrc.yml.
module.exports = {
  async constraints({ Yarn }) {
    for (const dependency of Yarn.dependencies()) {
      if (dependency.type !== 'peerDependencies' && dependency.range !== 'catalog:') {
        dependency.error(`${dependency.ident} must use "catalog:" and declare its version in .yarnrc.yml`);
      }
    }
  },
};
