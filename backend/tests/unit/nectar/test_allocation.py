from hive.nectar import allocation


def test_allocation_budget_and_quotas():
    alloc = {
        "status": "A",
        "quotas": [
            {"zone": "nectar", "resource": "rating.budget", "quota": 1200},
            {"zone": "melbourne", "resource": "compute.cores", "quota": 8},
            {"zone": "monash", "resource": "compute.cores", "quota": 4},
        ],
    }
    assert allocation.su_budget(alloc) == 1200
    assert allocation.quota(alloc, "compute.cores") == 8
    assert allocation.quota(alloc, "object.object") is None
    assert allocation.su_budget({"quotas": []}) is None
    assert allocation.pick_current([{"status": "X"}, alloc]) is alloc
    assert allocation.pick_current([]) is None
    assert allocation.is_trial("pt-50", "pt-")
    assert not allocation.is_trial("research", "pt-")
