import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { sendEmail } from '@/lib/email';
import { chinaNowSql } from '@/lib/china-time';

interface User {
  id: number;
  name: string;
  username: string;
  email?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, receiverIds, senderId, senderName, sendEmailOnly, specificEmail, attachment, skipEmail } = body;

    console.log('[Notification API] 收到请求:', {
      title,
      hasAttachment: !!attachment,
      attachmentFile: attachment?.fileUrl,
      attachmentName: attachment?.fileName
    });

    if (!title || !title.trim()) {
      return NextResponse.json({ error: '通知标题不能为空' }, { status: 400 });
    }

    // 如果是仅发送邮件给特定邮箱
    if (sendEmailOnly && specificEmail) {
      console.log(`[Notification API] 收到邮件发送请求: to=${specificEmail}, title=${title}`);
      
      // 构建邮件内容
      let emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${title}</h2>
        <p style="color: #666; line-height: 1.6;">${content || '您有一条新通知，请登录系统查看。'}</p>`;
      
      // 如果有附件，添加附件链接
      if (attachment && attachment.fileUrl) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const fullUrl = `${baseUrl}${attachment.fileUrl}`;
        console.log(`[Notification API] 仅邮件模式 - 附件链接: ${fullUrl}`);
        emailContent += `<p style="margin-top: 20px;"><a href="${fullUrl}" style="display: inline-block; padding: 10px 20px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 5px;">下载附件: ${attachment.fileName}</a></p>`;
      }
      
      emailContent += `<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">此邮件由聚星数据平台自动发送，请勿回复。</p>
      </div>`;
      
      // 获取附件文件路径
      let emailAttachment = undefined;
      if (attachment && attachment.filePath) {
        try {
          const pathModule = await import('path');
          const fs = await import('fs');
          const filePath = pathModule.join(process.cwd(), 'public', attachment.filePath);
          console.log(`[Notification API] 仅邮件模式 - 检查附件路径: ${filePath}, 存在: ${fs.existsSync(filePath)}`);
          if (fs.existsSync(filePath)) {
            emailAttachment = {
              filePath: filePath,
              fileName: attachment.fileName || 'attachment'
            };
          }
        } catch (err) {
          console.error('[Notification API] 处理附件时出错:', err);
        }
      }
      
      const emailResult = await sendEmail(
        specificEmail,
        `【聚星数据平台】${title}`,
        emailContent,
        emailAttachment
      );
      
      console.log(`[Notification API] 邮件发送结果: success=${emailResult.success}, error=${emailResult.error}`);
      
      return NextResponse.json({
        success: emailResult.success,
        message: emailResult.success ? '邮件发送成功' : '邮件发送失败',
        emailError: emailResult.error,
      });
    }

    // 获取所有用户
    const allUsers = db.prepare('SELECT id, name, username, email FROM users').all() as User[];

    // 获取接收者列表
    let receivers: User[] = [];
    
    if (receiverIds === 'all') {
      // 员工平台通知发送给所有在职员工，不受其是否拥有系统用户账号限制。
      const activeEmployees = db.prepare(`
        SELECT id, name, phone AS username
        FROM employees
        WHERE COALESCE(status, '在职') NOT IN ('离职', '已离职')
          AND TRIM(name) <> '' AND TRIM(COALESCE(id_card, '')) <> ''
      `).all() as User[];
      receivers = activeEmployees;
    } else if (Array.isArray(receiverIds) && receiverIds.length > 0) {
      // 发送给指定用户
      receivers = receiverIds.map((id: number) => {
        return allUsers.find(u => u.id === id);
      }).filter(Boolean) as User[];
    } else {
      return NextResponse.json({ error: '请选择接收用户' }, { status: 400 });
    }

    if (receivers.length === 0) {
      return NextResponse.json({ error: '没有可接收的用户' }, { status: 400 });
    }

    // 发送通知并尝试发送邮件
    let emailCount = 0;
    const results: { userId: number; notificationId: number; emailSent: boolean; emailError?: string }[] = [];

    for (const receiver of receivers) {
      // 获取当前本地时间
      const localTime = chinaNowSql();
      
      // 准备附件信息
      const attachmentFile = attachment?.fileUrl || null;
      const attachmentFileName = attachment?.fileName || null;
      
      console.log(`[Notification] 准备保存附件到数据库: file=${attachmentFile}, name=${attachmentFileName}`);
      
      // 插入通知记录
      const result = db.prepare(`
        INSERT INTO notifications (title, content, sender_id, sender_name, receiver_id, receiver_name, type, email_sent, email_error, attachment_file, attachment_file_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        title,
        content || '',
        senderId || null,
        senderName || '系统',
        receiver.id,
        receiver.name,
        'info',
        0,  // email_sent
        null,  // email_error
        attachmentFile,
        attachmentFileName,
        localTime
      );
      const notificationId = result.lastInsertRowid as number;
      
      console.log(`[Notification] 通知已保存到数据库，ID: ${notificationId}`);

      // 尝试发送邮件
      let emailSent = false;
      let emailError: string | undefined;
      
      if (!skipEmail && receiver.email) {
        // 构建邮件内容
        let emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${title}</h2>
          <p style="color: #666; line-height: 1.6;">${content || '您有一条新通知，请登录系统查看。'}</p>`;
        
        // 如果有附件，添加附件链接
        if (attachment && attachment.fileUrl) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          console.log(`[Notification] 附件URL: ${attachment.fileUrl}`);
          console.log(`[Notification] 基础URL: ${baseUrl}`);
          const fullUrl = `${baseUrl}${attachment.fileUrl}`;
          console.log(`[Notification] 完整附件链接: ${fullUrl}`);
          emailContent += `<p style="margin-top: 20px;"><a href="${fullUrl}" style="display: inline-block; padding: 10px 20px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 5px;">下载附件: ${attachment.fileName}</a></p>`;
        } else {
          console.log('[Notification] 没有附件信息');
        }
        
        emailContent += `<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">此邮件由聚星数据平台自动发送，请勿回复。</p>
        </div>`;
        
        // 获取附件文件路径并发送邮件
        let emailAttachment = undefined;
        if (attachment && attachment.fileUrl) {
          try {
            const pathModule = await import('path');
            const fs = await import('fs');
            // fileUrl 格式为: /uploads/xxx.jpg
            // 需要转换为完整路径: 项目目录/public/uploads/xxx.jpg
            const filePath = pathModule.join(process.cwd(), 'public', attachment.fileUrl.replace(/^\//, ''));
            console.log(`[Notification] 检查附件文件路径: ${filePath}`);
            console.log(`[Notification] 文件是否存在: ${fs.existsSync(filePath)}`);
            
            if (fs.existsSync(filePath)) {
              emailAttachment = {
                filePath: filePath,
                fileName: attachment.fileName || 'attachment'
              };
              console.log(`[Notification] 附件将添加到邮件中`);
            } else {
              console.log(`[Notification] 附件文件不存在，跳过添加`);
            }
          } catch (err) {
            console.error('[Notification] 处理附件时出错:', err);
          }
        }
        
        const emailResult = await sendEmail(
          receiver.email,
          `【聚星数据平台】${title}`,
          emailContent,
          emailAttachment
        );
        emailSent = emailResult.success;
        emailError = emailResult.error;
        
        // 更新邮件发送状态
        if (emailSent) {
          db.prepare('UPDATE notifications SET email_sent = 1 WHERE id = ?').run(notificationId);
          emailCount++;
          console.log(`[Notification] 邮件发送成功`);
        } else if (emailError) {
          db.prepare('UPDATE notifications SET email_error = ? WHERE id = ?').run(emailError, notificationId);
          console.log(`[Notification] 邮件发送失败: ${emailError}`);
        }
      }

      results.push({
        userId: receiver.id,
        notificationId,
        emailSent,
        emailError,
      });
    }

    return NextResponse.json({
      success: true,
      message: `通知已发送给 ${receivers.length} 位用户`,
      emailCount,
      results,
    });
  } catch (error: any) {
    console.error('发送通知失败:', error);
    return NextResponse.json({ error: error.message || '发送失败' }, { status: 500 });
  }
}
