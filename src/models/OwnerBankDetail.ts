import { Schema, model, Document, Types } from 'mongoose';

export type BankAccountType = 'owner' | 'admin';

export interface IOwnerBankDetail extends Document {
  accountType: BankAccountType;

  // Required only when accountType = "owner"
  owner?: Types.ObjectId;

  // Gateway account ID
  // Example: Cashfree/Razorpay/Stripe account ID
  gatewayAccountId?: string;

  accountHolderName: string;

  accountNumber?: string;

  ifscCode?: string;

  bankName?: string;

  branchName?: string;

  isVerified: boolean;

  createdAt: Date;

  updatedAt: Date;
}

const OwnerBankDetailSchema =
  new Schema<IOwnerBankDetail>(
    {
      // ------------------------------------------
      // ACCOUNT TYPE
      // ------------------------------------------

      accountType: {
        type: String,
        enum: ['owner', 'admin'],
        required: true,
        index: true,
      },

      // ------------------------------------------
      // OWNER
      // ------------------------------------------
      // Required for owner bank account.
      // Not required for admin account.

      owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: function () {
          return this.accountType === 'owner';
        },
        index: true,
      },

      // ------------------------------------------
      // PAYMENT GATEWAY ACCOUNT ID
      // ------------------------------------------

      gatewayAccountId: {
        type: String,
        trim: true,
      },

      // ------------------------------------------
      // BANK DETAILS
      // ------------------------------------------

      accountHolderName: {
        type: String,
        required: true,
        trim: true,
      },

      accountNumber: {
        type: String,
        trim: true,
      },

      ifscCode: {
        type: String,
        trim: true,
        uppercase: true,
      },

      bankName: {
        type: String,
        trim: true,
      },

      branchName: {
        type: String,
        trim: true,
      },

      // ------------------------------------------
      // VERIFICATION
      // ------------------------------------------

      isVerified: {
        type: Boolean,
        default: false,
      },

      // ------------------------------------------
      // TIMESTAMPS
      // ------------------------------------------

      createdAt: {
        type: Date,
        default: Date.now,
      },

      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      timestamps: true,
    },
  );

// --------------------------------------------------
// OWNER ACCOUNT: only one bank record per owner
// --------------------------------------------------

OwnerBankDetailSchema.index(
  { accountType: 1, owner: 1 },
  {
    unique: true,
    partialFilterExpression: {
      accountType: 'owner',
    },
  },
);

// --------------------------------------------------
// ADMIN ACCOUNT: only one admin bank record
// --------------------------------------------------

OwnerBankDetailSchema.index(
  { accountType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      accountType: 'admin',
    },
  },
);

export const OwnerBankDetail =
  model<IOwnerBankDetail>(
    'OwnerBankDetail',
    OwnerBankDetailSchema,
  );
