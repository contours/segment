#! /bin/sh

die () {
  echo >&2 "$@"
  exit 1
}

[ "$#" -eq 1 ] || die "Usage: deploy.sh hostname"

HOST=$1

git archive --format=zip --prefix=segment/ HEAD -o segment.zip
scp segment.zip $HOST:
ssh $HOST 'unzip -u -o segment.zip && cd segment && npm install'
rm -f segment.zip

