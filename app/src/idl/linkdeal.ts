/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/linkdeal.json`.
 */
export type Linkdeal = {
  "address": "AjavKz4Y4NkvuvxdwAWQ5Wt4BUpJowA6H23PEdV9rd2S",
  "metadata": {
    "name": "linkdeal",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "approveMilestone",
      "discriminator": [
        145,
        85,
        92,
        60,
        50,
        130,
        219,
        106
      ],
      "accounts": [
        {
          "name": "client",
          "signer": true
        },
        {
          "name": "freelancer",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "freelancer",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createEscrow",
      "discriminator": [
        253,
        215,
        165,
        116,
        36,
        108,
        68,
        80
      ],
      "accounts": [
        {
          "name": "freelancer",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "tasks",
          "type": {
            "vec": {
              "defined": {
                "name": "task"
              }
            }
          }
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "offerExpiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "fund",
      "discriminator": [
        218,
        188,
        111,
        221,
        152,
        113,
        174,
        7
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "refundAfterDeadline",
      "discriminator": [
        175,
        189,
        26,
        90,
        209,
        113,
        41,
        159
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true
        },
        {
          "name": "freelancer",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "escrow",
      "discriminator": [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "zeroAmount",
      "msg": "Milestone amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "amountTooLarge",
      "msg": "Total amount is too large"
    },
    {
      "code": 6002,
      "name": "badDates",
      "msg": "Offer must expire in the future and not after the deadline"
    },
    {
      "code": 6003,
      "name": "badTaskCount",
      "msg": "Contract must have 1 to 10 milestones"
    },
    {
      "code": 6004,
      "name": "badDescription",
      "msg": "Milestone description must be 1 to 100 bytes"
    },
    {
      "code": 6005,
      "name": "alreadyFunded",
      "msg": "Contract is already funded"
    },
    {
      "code": 6006,
      "name": "offerExpired",
      "msg": "Offer has expired"
    },
    {
      "code": 6007,
      "name": "deadlinePassed",
      "msg": "Deadline has passed"
    },
    {
      "code": 6008,
      "name": "notClient",
      "msg": "Only the client who funded the contract can do this"
    },
    {
      "code": 6009,
      "name": "offerStillValid",
      "msg": "Offer is still valid"
    },
    {
      "code": 6010,
      "name": "deadlineNotPassed",
      "msg": "Deadline has not passed yet"
    }
  ],
  "types": [
    {
      "name": "escrow",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "client",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "tasks",
            "type": {
              "vec": {
                "defined": {
                  "name": "task"
                }
              }
            }
          },
          {
            "name": "approved",
            "type": "u8"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "offerExpiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "task",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
