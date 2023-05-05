#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

cd samples

ok_tests=()

count=0
for i in *.{js,mjs}
do
    node $i
    ok_tests+=("$i")
    count=$((count + 1))
done

echo
echo "Done"
echo "All $count tests passed:"
for i in "${ok_tests[@]}"
do
    echo "    $i: ok"
done
echo "Success"
