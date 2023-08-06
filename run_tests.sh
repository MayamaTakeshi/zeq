#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

cd samples

ok_tests=()

current_test=""

handle_error() {
    echo
    echo "An error occurred while executing $current_test"
    exit 1
}

trap 'handle_error' ERR

count=0
for i in *.{js,mjs}
do
    current_test=$i
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
