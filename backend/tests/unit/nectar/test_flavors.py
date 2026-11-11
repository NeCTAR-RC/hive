from hive.nectar.flavors import FlavorRules


class TestFlavorRules:
    def test_su_rate_and_preemptible(self):
        r = FlavorRules()
        flavor = {
            "id": "f1",
            "name": "m3.small",
            "vcpus": 2,
            "ram": 4096,
            "disk": 30,
            "extra_specs": {"nectar:rate": "0.5", "flavor_class:name": "m3"},
        }
        summary = r.summary(flavor)
        assert summary["su_rate"] == 0.5
        assert summary["is_preemptible"] is False
        assert summary["ram_mb"] == 4096
        pre = {
            "id": "f2",
            "name": "p3.small",
            "extra_specs": {"flavor_class:name": "preemptible"},
        }
        assert r.is_preemptible(pre)
        assert r.su_rate({"extra_specs": {"nectar:rate": "junk"}}) is None
        assert r.su_rate({}) is None

    def test_resize_candidates_hide_by_prefix_or_class(self):
        flavors = [
            {"id": "a", "name": "m3.small", "extra_specs": {}},
            {"id": "b", "name": "p1.small", "extra_specs": {}},
            {"id": "c", "name": "p3.large", "extra_specs": {}},
            {
                "id": "d",
                "name": "r3.huge",
                "extra_specs": {"flavor_class:name": "r3"},
            },
        ]
        by_prefix = FlavorRules(hidden_resize_prefixes=["p1.", "p3."])
        assert [
            f["id"] for f in by_prefix.resize_candidates("a", flavors)
        ] == ["d"]
        by_class = FlavorRules(hidden_resize_classes=["r3"])
        assert [
            f["id"] for f in by_class.resize_candidates(None, flavors)
        ] == [
            "a",
            "b",
            "c",
        ]

    def test_summary_from_embedded_server_flavor(self):
        r = FlavorRules()
        embedded = {
            "original_name": "m3.medium",
            "vcpus": 4,
            "ram": 8192,
            "disk": 30,
            "ephemeral": 0,
            "extra_specs": {"nectar:rate": "1"},
        }
        assert r.summary(embedded)["name"] == "m3.medium"
        assert r.summary(embedded)["su_rate"] == 1.0

    def test_reservation_flavors(self):
        r = FlavorRules()
        # Blazar copies the source flavour's specs, so a class may be
        # present; the reservation still wins.
        by_spec = {
            "id": "res-1",
            "name": "reservation:res-1",
            "os-flavor-access:is_public": False,
            "extra_specs": {
                "flavor_class:name": "standard-v3",
                "aggregate_instance_extra_specs:reservation": "res-1",
                "resources:CUSTOM_RESERVATION_RES_1": "1",
            },
        }
        assert r.is_reservation(by_spec)
        assert r.reservation_id(by_spec) == "res-1"
        summary = r.summary(by_spec)
        assert summary["is_reservation"] is True
        assert summary["reservation_id"] == "res-1"
        assert summary["flavor_class"] == "standard-v3"
        by_name = {"id": "x", "name": "reservation:res-2", "extra_specs": {}}
        assert r.reservation_id(by_name) == "res-2"
        plain = {"id": "f", "name": "m3.small", "extra_specs": {}}
        assert not r.is_reservation(plain)
        assert r.summary(plain)["reservation_id"] is None
        custom = FlavorRules(reservation_spec="nectar:reservation")
        assert (
            custom.reservation_id(
                {"name": "x", "extra_specs": {"nectar:reservation": "r"}}
            )
            == "r"
        )

    def test_launch_zone(self):
        r = FlavorRules()
        reserved = {"id": "x", "name": "reservation:res-2", "extra_specs": {}}
        plain = {"id": "f", "name": "m3.small", "extra_specs": {}}
        assert r.launch_zone(plain, "melbourne-qh2") == "melbourne-qh2"
        assert r.launch_zone(None, "melbourne-qh2") == "melbourne-qh2"
        assert r.launch_zone(plain, "") is None
        assert r.launch_zone(plain, None) is None
        assert r.launch_zone(reserved, "melbourne-qh2") is None

    def test_flavor_classes_known_then_unknown(self):
        r = FlavorRules()

        def flavor(name, cls=None, reservation=None):
            specs = {}
            if cls:
                specs["flavor_class:name"] = cls
            if reservation:
                specs["aggregate_instance_extra_specs:reservation"] = (
                    reservation
                )
            return r.summary({"id": name, "name": name, "extra_specs": specs})

        summaries = [
            flavor("zz.small", "zzz-class"),
            flavor("m3.small", "standard-v3"),
            flavor("m3.medium", "standard-v3"),
            flavor("aa.small", "aaa-class"),
            flavor("t3.small", "tiny-v3"),
            flavor("c1.xxlarge"),
            flavor("reservation:res-1", "standard-v3", reservation="res-1"),
        ]
        classes = r.flavor_classes(summaries)
        assert [c["id"] for c in classes] == [
            "standard-v3",
            "tiny-v3",
            "aaa-class",
            "zzz-class",
        ]
        balanced = classes[0]
        assert balanced["title"] == "Balanced (m3)"
        assert balanced["description"].startswith("Suited to most")
        assert balanced["count"] == 2
        unknown = classes[2]
        assert unknown == {
            "id": "aaa-class",
            "title": "aaa-class",
            "description": None,
            "count": 1,
        }
