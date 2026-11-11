import base64

import pytest

from hive.nectar import objectstore
from hive.nectar.violation import RuleViolation


def test_a_plain_container_name_passes():
    objectstore.validate_container_name("docs")


@pytest.mark.parametrize(
    ("name", "says"),
    [("", "Enter"), ("a/b", "slash"), ("x" * 300, "256")],
)
def test_container_names_that_break_the_rules(name, says):
    with pytest.raises(RuleViolation, match=says):
        objectstore.validate_container_name(name)


def test_a_nested_object_name_passes():
    objectstore.validate_object_name("a/b.txt")


@pytest.mark.parametrize(
    ("name", "says"),
    [
        ("", "Enter a name"),
        ("/", "Enter a name"),
        ("/a", "start with a slash"),
        ("a//b", "empty folder"),
        ("x" * 1025, "1024"),
    ],
)
def test_object_names_that_break_the_rules(name, says):
    with pytest.raises(RuleViolation, match=says):
        objectstore.validate_object_name(name)


@pytest.mark.parametrize(
    ("parent", "path", "folder"),
    [("docs/", "notes", "docs/notes/"), ("", "/x/", "x/")],
)
def test_folder_name(parent, path, folder):
    assert objectstore.folder_name(parent, path) == folder


def test_object_summaries_and_folders():
    entry = objectstore.object_summary({"subdir": "docs/notes/"}, "docs/")
    assert entry['is_folder']
    assert entry['basename'] == 'notes'
    marker = objectstore.object_summary(
        {"name": "docs/old/", "bytes": 0}, "docs/"
    )
    assert marker['is_folder']
    assert marker['basename'] == 'old'
    plain = objectstore.object_summary(
        {
            "name": "docs/a.txt",
            "bytes": 12,
            "content_type": "text/plain",
            "hash": "h",
        },
        "docs/",
    )
    assert not plain['is_folder']
    assert plain['basename'] == 'a.txt'
    assert objectstore.is_public('.r:*,.rlistings')
    assert not objectstore.is_public('')
    meta = objectstore.container_metadata(
        {
            "x-container-object-count": "3",
            "x-container-bytes-used": "99",
            "x-container-read": ".r:*,.rlistings",
            "x-container-meta-access-control-allow-origin": "https://hive.test",
            "x-container-meta-owner": "me",
            "x-storage-policy": "default-placement",
        }
    )
    assert meta['is_public']
    assert meta['object_count'] == 3
    assert meta['cors_origin'] == 'https://hive.test'
    assert meta['metadata'] == {'owner': 'me'}
    obj = objectstore.object_metadata(
        {
            "content-length": "5",
            "etag": "e",
            "x-static-large-object": "True",
            "x-object-meta-k": "v",
        }
    )
    assert obj['is_slo']
    assert obj['metadata'] == {'k': 'v'}
    assert obj['bytes'] == 5


def test_temp_url_signature_and_url():
    sig = objectstore.temp_url_signature(
        "key", "GET", 1000, "/v1/AUTH_p/c/o", "sha1"
    )
    assert len(sig) == 40
    sig256 = objectstore.temp_url_signature(
        "key", "GET", 1000, "/v1/AUTH_p/c/o"
    )
    # Swift wants a prefixed signature base64 encoded, not hex
    assert sig256.startswith("sha256:")
    assert len(base64.urlsafe_b64decode(sig256[7:])) == 32
    sig512 = objectstore.temp_url_signature(
        "key", "GET", 1000, "/v1/AUTH_p/c/o", "sha512"
    )
    assert sig512.startswith('sha512:')
    assert len(base64.urlsafe_b64decode(sig512[7:])) == 64
    url = objectstore.temp_url(
        "https://store.test/swift/v1",
        "my container",
        "docs/a b.txt",
        key="key",
        method="PUT",
        ttl=60,
        now=1000,
        query={"multipart-manifest": "put"},
    )
    assert url.startswith(
        "https://store.test/swift/v1/my%20container/docs/a%20b.txt?"
    )
    assert 'temp_url_expires=1060' in url
    assert 'multipart-manifest=put' in url
    assert "temp_url_sig=sha256:" in url
    classic = objectstore.temp_url(
        "https://swift.test/v1/AUTH_p",
        "c",
        "o",
        key="k",
        method="GET",
        ttl=1,
        now=0,
    )
    assert classic.startswith("https://swift.test/v1/AUTH_p/c/o?")


def test_segment_plan_and_manifest():
    assert objectstore.segment_plan(10, 100) == [(0, 10)]
    assert objectstore.segment_plan(250, 100) == [
        (0, 100),
        (100, 100),
        (200, 50),
    ]
    names = objectstore.segment_names("big.iso", "123", 2)
    assert names == ["big.iso/123/00000000", "big.iso/123/00000001"]
    manifest = objectstore.manifest_entries("c_segments", names, [100, 50])
    assert manifest[1] == {
        "path": "/c_segments/big.iso/123/00000001",
        "size_bytes": 50,
    }


@pytest.mark.parametrize(
    ("entry", "slo"),
    [
        ({"name": "big.bin", "slo_etag": '"abc"', "bytes": 9}, True),
        ({"name": "small.txt", "hash": "d41d8", "bytes": 0}, False),
    ],
)
def test_a_listing_entry_says_whether_it_is_a_large_object(entry, slo):
    assert objectstore.is_slo_entry(entry) is slo
