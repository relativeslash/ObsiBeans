#!/usr/bin/env bash
# Beans 0.4.2 contract audit: verifies release provenance, compares CLI help and
# GraphQL schema with committed snapshots, and asserts the BC-* contract facts
# recorded in docs/Private/Design/Beans 0.4.2 contract.md.
#
# Usage: test/contract/beans-0.4.2/audit.sh [--update-snapshots]
# Needs: bash, curl, tar, sha256sum, jq, python3. Works only in temporary
# directories; never touches the repository's own tracker.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SNAP="$HERE/snapshots"
URL=https://github.com/hmans/beans/releases/download/v0.4.2
ARCHIVE=beans_Linux_x86_64.tar.gz
ARCHIVE_SHA=266d1e4dc7392c38131c4842c60cbd2f14d5e5f7a520bc297a9b9056fda7fcd0
BINARY_SHA=a96444ff61509fb7a94ca7733e76a96768967fe8efc592d84df35e45e3d94307
VERSION_LINE='beans 0.4.2 (670ecf3) built 2026-03-10T20:07:43Z'

WORK=$(mktemp -d)
trap 'chmod -R u+w "$WORK" 2>/dev/null; rm -rf "$WORK"' EXIT
unset BEANS_PATH
FAILS=0
ok()   { echo "ok   $1"; }
fail() { echo "FAIL $1${2:+ :: $2}"; FAILS=$((FAILS + 1)); }
check() { local id=$1; shift; if "$@"; then ok "$id"; else fail "$id"; fi; }

# --- Provenance ---------------------------------------------------------------
B="$WORK/bin/beans"
mkdir -p "$WORK/bin"
curl -fsSL -o "$WORK/$ARCHIVE" "$URL/$ARCHIVE" || { echo "download failed"; exit 2; }
curl -fsSL -o "$WORK/checksums.txt" "$URL/beans_0.4.2_checksums.txt" || { echo "download failed"; exit 2; }
check BC-00a-archive-checksum-file grep -q "^$ARCHIVE_SHA  $ARCHIVE\$" "$WORK/checksums.txt"
check BC-00b-archive-sha256 test "$(sha256sum "$WORK/$ARCHIVE" | cut -d' ' -f1)" = "$ARCHIVE_SHA"
tar -xzf "$WORK/$ARCHIVE" -C "$WORK/bin" beans
check BC-00c-binary-sha256 test "$(sha256sum "$B" | cut -d' ' -f1)" = "$BINARY_SHA"
check BC-01-version-line test "$("$B" version)" = "$VERSION_LINE"

# --- Fixture project ------------------------------------------------------------
P="$WORK/proj with space"
T="$P/docs/Task root"
mkdir -p "$T"
cat > "$P/.beans.yml" <<'EOF'
beans:
    path: docs/Task root
    prefix: FX-
    id_length: 5
    default_status: draft
    default_type: feature
EOF
cd "$P" || exit 2

# gq <query> [variables-json]: sets OUT, ERR, RC
gq() {
  if [ $# -gt 1 ]; then OUT=$("$B" graphql --json -v "$2" "$1" 2>"$WORK/err"); RC=$?
  else OUT=$("$B" graphql --json "$1" 2>"$WORK/err"); RC=$?; fi
  ERR=$(head -1 "$WORK/err")
}
val() { echo "$OUT" | jq -r "$1"; }
new() { gq "mutation { createBean(input:{title:\"$1\", type:\"$2\", status:\"todo\", priority:\"normal\"}) { id } }"; val .createBean.id; }
fnv() { python3 -c 'import sys
h=0xcbf29ce484222325
for b in open(sys.argv[1],"rb").read(): h=((h^b)*0x100000001b3)&0xFFFFFFFFFFFFFFFF
print("%016x"%h)' "$1"; }
file_of() { echo "$T/$(gq "{ bean(id:\"$1\") { path } }"; val .bean.path)"; }

# --- Snapshots ------------------------------------------------------------------
mkdir -p "$WORK/snap"
"$B" --help > "$WORK/snap/help-root.txt"
for c in archive check create delete graphql init list prime roadmap show tui update version; do
  "$B" "$c" --help > "$WORK/snap/help-$c.txt"
done
"$B" graphql --schema > "$WORK/snap/schema.graphql"
if [ "${1:-}" = "--update-snapshots" ]; then
  rm -rf "$SNAP"; cp -r "$WORK/snap" "$SNAP"; ok "snapshots-updated"
else
  check BC-02-help-and-schema-snapshots diff -r "$SNAP" "$WORK/snap"
fi
(cd "$WORK" && "$B" graphql --schema >/dev/null 2>&1); check BC-03-schema-needs-project test $? -ne 0

# --- Invocation -------------------------------------------------------------------
gq '{ bean(id:"FX-zzzzz") { id } }'
check BC-04-missing-bean-is-null test "$(val .bean)" = null
gq 'mutation { setParent(id:"FX-zzzzz", parentId:null) { id } }'
check BC-05-error-shape test "$RC" = 1 -a -z "$OUT" -a "${ERR#Error: graphql: }" != "$ERR"
colored() { "$B" graphql '{ beans { id } }' | grep -q $'\e'; }
check BC-06-color-without-json colored
mkdir -p "$WORK/elsewhere"
check BC-07-beans-path-env-overrides test "$(BEANS_PATH="$WORK/elsewhere" "$B" graphql --json '{ beans { id } }' | jq '.beans|length')" = 0

# --- Creation and validation ----------------------------------------------------------
gq 'mutation { createBean(input:{title:"Plain"}) { id status type priority } }'
PLAIN=$(val .createBean.id)
check BC-08-graphql-create-ignores-config-defaults test "$(val '.createBean|.status+"/"+.type+"/"+.priority')" = "/task/"
check BC-09-cli-create-applies-config-defaults test "$("$B" create --json Cli | jq -r '.bean.status+"/"+.bean.type')" = "draft/feature"
gq 'mutation { createBean(input:{title:"Bad", status:"banana", type:"gizmo", priority:"urgent", tags:["Bad Tag"]}) { status type priority tags } }'
check BC-10-graphql-accepts-invalid-values test "$(val '[.createBean.status,.createBean.type,.createBean.priority,.createBean.tags[0]]|join("/")')" = "banana/gizmo/urgent/Bad Tag"
"$B" create --json Bad -s banana >/dev/null 2>&1; check BC-11-cli-validates-status test $? = 1
check BC-12-cli-accepts-invalid-tag test "$("$B" create --json T --tag 'Bad Tag' | jq -r '.bean.tags[0]')" = "Bad Tag"
gq 'mutation { createBean(input:{title:""}) { path } }'
check BC-13-empty-title-accepted test "$RC" = 0
mkdir -p "$WORK/nodefault/.beans"; printf 'beans:\n    prefix: ND-\n' > "$WORK/nodefault/.beans.yml"
check BC-14-missing-default-type-means-milestone test "$(cd "$WORK/nodefault" && "$B" create --json x | jq -r .bean.type)" = milestone

# --- ETags --------------------------------------------------------------------------------
F=$(file_of "$PLAIN")
gq "{ bean(id:\"$PLAIN\") { etag } }"; QE=$(val .bean.etag)
check BC-15-query-etag-differs-for-noncanonical-file test "$QE" != "$(fnv "$F")"
gq "mutation { updateBean(id:\"$PLAIN\", input:{title:\"P2\", ifMatch:\"$QE\"}) { id } }"
check BC-16-query-etag-rejected-and-error-reveals-disk-etag test "$ERR" = "Error: graphql: etag mismatch: provided $QE, current is $(fnv "$F")"
gq "mutation { updateBean(id:\"$PLAIN\", input:{title:\"P2\", ifMatch:\"$(fnv "$F")\"}) { etag } }"
check BC-17-disk-fnv-etag-accepted test "$RC" = 0
check BC-18-canonical-file-etags-agree test "$(val .updateBean.etag)" = "$(fnv "$F")"
gq "mutation { setParent(id:\"$PLAIN\", parentId:null, ifMatch:\"0000000000000001\") { id } }"
check BC-19-relationship-mutations-honour-ifmatch test "${ERR#Error: graphql: etag mismatch}" != "$ERR"

# --- Persistence and frontmatter ----------------------------------------------------------
python3 - "$F" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
open(p, "w").write(s.replace("title:", "aliases:\n    - Alias\norder: a0\ncustom: keep # comment\ntitle:", 1))
EOF
gq "mutation { updateBean(id:\"$PLAIN\", input:{title:\"Renamed title\"}) { path slug } }"
check BC-20-unknown-frontmatter-and-comments-dropped bash -c "! grep -qE 'aliases|order:|custom|#.*comment' '$F'"
check BC-21-title-change-keeps-path test "$(val .updateBean.path)" = "$(basename "$F")" -a "$(val .updateBean.slug)" = plain
gq "mutation(\$b:String) { updateBean(id:\"$PLAIN\", input:{body:\$b}) { id } }" '{"b":"- [ ] Same\n- [ ] Same\n- [ ] Unique\n"}'
gq "{ bean(id:\"$PLAIN\") { body } }"
check BC-22-body-readback-normalised test "$(echo "$OUT" | jq -c .bean.body)" = '"\n- [ ] Same\n- [ ] Same\n- [ ] Unique"'
gq "mutation { updateBean(id:\"$PLAIN\", input:{bodyMod:{replace:[{old:\"- [ ] Same\", new:\"- [x] Same\"}]}}) { id } }"
check BC-23-duplicate-replace-rejected test "$ERR" = "Error: graphql: replacement 0 failed: text found 2 times in body (must be unique)"
gq "mutation { updateBean(id:\"$PLAIN\", input:{bodyMod:{replace:[{old:\"- [ ] Unique\", new:\"- [x] Unique\"},{old:\"absent\", new:\"x\"}]}}) { id } }"
check BC-24-bodymod-all-or-nothing grep -q -- '- \[ \] Unique' "$F"
gq "mutation { a: updateBean(id:\"$PLAIN\", input:{title:\"First wrote\"}) { id } b: setParent(id:\"$PLAIN\", parentId:\"FX-zzzzz\") { id } }"
check BC-25-multi-field-document-not-atomic test "$RC" = 1 -a -z "$OUT" -a "$(grep '^title:' "$F")" = "title: First wrote"
chmod 444 "$F"
gq "mutation { updateBean(id:\"$PLAIN\", input:{title:\"x\"}) { id } }"
check BC-26-write-failure-reported test "$RC" = 1 -a "${ERR%permission denied}" != "$ERR"
chmod 644 "$F"

# --- Hierarchy ----------------------------------------------------------------------------
M=$(new M milestone); E=$(new E epic); FE=$(new Fe feature); TA=$(new Ta task)
gq "mutation { setParent(id:\"$TA\", parentId:\"$PLAIN\") { id } }"
check BC-27-task-cannot-parent-task test "$ERR" = "Error: graphql: task beans can only have milestone, epic, or feature as parent, not task"
gq "mutation { setParent(id:\"$M\", parentId:\"$E\") { id } }"
check BC-28-milestone-cannot-have-parent test "$ERR" = "Error: graphql: milestone beans cannot have a parent"
gq "mutation { a: setParent(id:\"$E\", parentId:\"$M\") { id } b: setParent(id:\"$FE\", parentId:\"$E\") { id } c: setParent(id:\"${TA#FX-}\", parentId:\"${FE#FX-}\") { parentId } }"
check BC-29-short-ids-normalised test "$(val .c.parentId)" = "$FE"
gq "mutation { updateBean(id:\"$FE\", input:{type:\"task\"}) { children { id } } }"
check BC-30-type-change-keeps-invalid-children test "$(val '.updateBean.children[0].id')" = "$TA"
gq "mutation { updateBean(id:\"$FE\", input:{type:\"feature\"}) { id } }"
gq "mutation { a: updateBean(id:\"$M\", input:{type:\"epic\"}) { id } b: updateBean(id:\"$E\", input:{type:\"milestone\"}) { id } }"
gq "mutation { setParent(id:\"$M\", parentId:\"$E\") { id } }"
check BC-31-parent-cycle-rejected test "${ERR#Error: graphql: would create cycle}" != "$ERR"

# --- Blocking -----------------------------------------------------------------------------
X=$(new X task); Y=$(new Y task); Z=$(new Z task)
gq "mutation { addBlocking(id:\"$X\", targetId:\"$X\") { id } }"; check BC-32-self-block-rejected test "$ERR" = "Error: graphql: bean cannot block itself"
gq "mutation { addBlocking(id:\"$X\", targetId:\"FX-zzzzz\") { id } }"; check BC-33-missing-target-rejected test "$ERR" = "Error: graphql: target bean not found: FX-zzzzz"
gq "mutation { addBlocking(id:\"$X\", targetId:\"$Y\") { id } }"
gq "mutation { addBlockedBy(id:\"$X\", targetId:\"$Y\") { id } }"; check BC-34-direct-cycle-rejected test "${ERR#Error: graphql: would create cycle}" != "$ERR"
gq "mutation { addBlockedBy(id:\"$Z\", targetId:\"$Y\") { id } }"
gq "mutation { addBlocking(id:\"$Z\", targetId:\"$X\") { id } }"; check BC-35-mixed-direction-cycle-accepted test "$RC" = 0
check_passes() { "$B" check >/dev/null 2>&1; }
check BC-36-check-misses-mixed-cycle check_passes
gq "{ bean(id:\"$Y\") { blockingIds blockedByIds blocking { id } blockedBy { id } } }"
check BC-37-relationship-fields-one-directional test "$(val '[(.bean.blocking|length), (.bean.blockedBy|map(.id)|join(","))]|map(tostring)|join("/")')" = "0/$X"
gq "{ beans(filter:{isBlocked:true}) { id } }"
check BC-38-isblocked-uses-both-directions bash -c "echo '$OUT' | jq -e '[.beans[].id] | index(\"$Z\") and index(\"$Y\") and index(\"$X\")' >/dev/null"
gq "mutation { updateBean(id:\"$Y\", input:{status:\"completed\"}) { id } }"
gq "{ beans(filter:{isBlocked:false, excludeStatus:[\"in-progress\",\"completed\",\"scrapped\",\"draft\"]}) { id } }"
check BC-39-ready-filter-matches-cli test "$(val '[.beans[].id]|sort|join(",")')" = "$("$B" list --json --ready | jq -r '[.[].id]|sort|join(",")')"

# --- Loading ------------------------------------------------------------------------------
gq '{ beans(filter:{search:"title:("}) { id } }'; check BC-40-invalid-search-is-empty-success test "$RC" = 0 -a "$(val '.beans|length')" = 0
mkdir -p "$T/archive" "$T/sub"; printf '# Note\n' > "$T/sub/Folder note.md"
gq '{ bean(id:"Folder note") { status path } }'
check BC-41-any-markdown-file-is-a-bean test "$(val '.bean.status+"|"+.bean.path')" = "|sub/Folder note.md"
cp "$F" "$T/archive/$(basename "$F" | sed 's/--/--copy--/')"
gq "{ beans { id path } }"
check BC-42-duplicate-id-silently-shadowed test "$(val "[.beans[]|select(.id==\"$PLAIN\")]|length")" = 1
mv "$(file_of "$Z")" "$T/archive/"
gq "{ bean(id:\"$Z\") { path } }"; check BC-43-archive-folder-loaded test "${OUT#*archive/}" != "$OUT"
check BC-43b-check-ignores-duplicate-ids check_passes
printf -- '---\ntitle: [broken\n---\n' > "$T/sub/FX-bad00--broken.md"
gq '{ beans { id } }'; check BC-44-one-malformed-file-fails-all-reads test "$RC" = 1 -a "${ERR#Error: loading beans}" != "$ERR"

echo
[ "$FAILS" = 0 ] && echo "PASS: Beans 0.4.2 contract holds" || echo "FAILED: $FAILS contract assertion(s) differ"
exit $((FAILS > 0))
