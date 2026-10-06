import mongoose, {
  Schema,
  Document,
  Types,
} from 'mongoose';

export type NotificationType =
  | 'confirmed'
  | 'cancelled'
  | 'reminder'
  | 'promotional';

export type NotificationRecipientRole =
  | 'user'
  | 'owner'
  | 'admin';

export interface INotification extends Document {
  recipient: Types.ObjectId;
  recipientRole: NotificationRecipientRole;
  type: NotificationType;
  title: string;
  message: string;
  booking?: Types.ObjectId;
  turf?: Types.ObjectId;
  court?: Types.ObjectId;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema =
  new Schema<INotification>(
    {
      recipient: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },

      recipientRole: {
        type: String,
        enum: ['user', 'owner', 'admin'],
        required: true,
        index: true,
      },

      type: {
        type: String,
        enum: [
          'confirmed',
          'cancelled',
          'reminder',
          'promotional',
        ],
        required: true,
        default: 'confirmed',
        index: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150,
      },

      message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
      },

      booking: {
        type: Schema.Types.ObjectId,
        ref: 'Booking',
        index: true,
      },

      turf: {
        type: Schema.Types.ObjectId,
        ref: 'Turf',
      },

      court: {
        type: Schema.Types.ObjectId,
        ref: 'Court',
      },

      read: {
        type: Boolean,
        default: false,
        index: true,
      },
    },
    {
      timestamps: true,
    },
  );

NotificationSchema.index({
  recipient: 1,
  createdAt: -1,
});

NotificationSchema.index({
  recipient: 1,
  read: 1,
  createdAt: -1,
});

export const Notification =
  mongoose.models.Notification ||
  mongoose.model<INotification>(
    'Notification',
    NotificationSchema,
  );

export default Notification;
